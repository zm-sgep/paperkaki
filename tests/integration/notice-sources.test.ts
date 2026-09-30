import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { confirmNotice, deleteNoticeFile, retryNotice, uploadNotice } from "@/application/commands/notice-sources";
import { InputError, NotFoundError } from "@/application/errors";
import { NOTICE_EXTRACTION_JOB, processNoticeSource } from "@/application/notice-processing";
import { getAssessmentSetup } from "@/application/queries/assessment-setup";
import { getNoticeScreen, getNoticeStatus } from "@/application/queries/notice-sources";
import type { Database } from "@/repositories/postgres/client";
import { assessmentSources, assessments, auditLogs, jobs as jobsTable, schoolPaperFormats } from "@/repositories/postgres/schema";
import { NoticeExtractionSchema } from "@/schemas/notice-extraction";
import { createAIService, createFixtureAdapter, AIError, type AIAdapter, type AIService } from "@/services/ai";
import { STUCK_AFTER_MS, createJobService, type JobService } from "@/services/jobs";
import { sampleNoticePdf, sampleNoticePhotos, sha256Of } from "../fixtures/notices";
import { insertParentProfile } from "../factories";
import { createMemoryStorage, type MemoryStorage } from "../helpers/memory-storage";
import { seedRealBank } from "../helpers/seed-bank";
import { createTestDb, type TestDatabase } from "../helpers/test-db";
import { tinyPdf } from "../helpers/tiny-pdf";

// Fixed "now": Singapore date 2026-09-29, so the sample letter's 27 Oct date is in the future.
const NOW = new Date("2026-09-29T02:00:00Z");
const FIXTURE_DIR = path.resolve(import.meta.dirname, "../fixtures/ai");

describe("school notice upload, reading and confirming (M5)", () => {
  let testDb: TestDatabase;
  let db: Database;
  let storage: MemoryStorage;
  let parentA: string;
  let parentB: string;
  let ai: AIService;
  let jobs: JobService;
  let extractionCalls = 0;

  /** The fixture provider, with a way to make the next call fail. */
  let failNext: AIError | null = null;
  const counting = (adapter: AIAdapter): AIAdapter => ({
    ...adapter,
    async extractSchoolNotice(input) {
      extractionCalls += 1;
      if (failNext) {
        const error = failNext;
        failNext = null;
        throw error;
      }
      return adapter.extractSchoolNotice(input);
    },
    mapTopics: (input) => adapter.mapTopics(input),
  });

  const ctx = () => ({ db, now: NOW, storage });

  beforeAll(async () => {
    testDb = await createTestDb();
    db = testDb.db;
    storage = createMemoryStorage();
    await seedRealBank(db);
    parentA = (await insertParentProfile(db, "A")).id;
    parentB = (await insertParentProfile(db, "B")).id;
    ai = createAIService({ adapter: counting(createFixtureAdapter({ dir: FIXTURE_DIR })) });
    jobs = createJobService({ db });
    jobs.register(NOTICE_EXTRACTION_JOB, async (payload) => {
      await processNoticeSource(String(payload.sourceId), { db, ai, storage, now: NOW });
    });
  });

  afterAll(async () => {
    await testDb.close();
  });

  async function upload(parent: string, files: Uint8Array[], options: { childId?: string; nickname?: string } = {}) {
    const result = await uploadNotice(
      parent,
      { childId: options.childId, newChildNickname: options.childId ? undefined : (options.nickname ?? "Test Child A"), files: files.map((bytes) => ({ bytes })) },
      jobs,
      ctx(),
    );
    return result;
  }

  async function uploadAndRead(parent: string, files: Uint8Array[], options: { childId?: string; nickname?: string } = {}) {
    const result = await upload(parent, files, options);
    await jobs.run(result.jobId);
    return result;
  }

  describe("upload", () => {
    it("stores the PDF privately, records it queued, and queues a job that names only the source", async () => {
      const pdf = sampleNoticePdf();
      const { sourceId, jobId } = await upload(parentA, [pdf], { nickname: "Test Child U" });
      const [row] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      expect(row).toMatchObject({
        parentProfileId: parentA,
        bucket: "assessment-source-uploads",
        mime: "application/pdf",
        status: "queued",
        pageCount: 2,
        assessmentId: null,
        sha256: sha256Of([pdf]),
      });
      expect(row?.objectKey.startsWith(`${parentA}/${sourceId}/`)).toBe(true);
      expect(row?.objectKey).not.toMatch(/https?:|sample/);
      expect(await storage.exists({ bucket: "assessment-source-uploads", key: row?.objectKey ?? "" })).toBe(true);
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      expect(job).toMatchObject({ kind: NOTICE_EXTRACTION_JOB, status: "queued", payload: { sourceId } });
      const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, sourceId));
      expect(audit.map((event) => event.action)).toContain("assessment_source.uploaded");
      expect(JSON.stringify(audit)).not.toMatch(/Test Child|sample/);
    });

    it("keeps several photos in order under one source, hashed together", async () => {
      const photos = sampleNoticePhotos();
      const { sourceId } = await upload(parentA, photos, { nickname: "Test Child P" });
      const [row] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      expect(row?.mime).toBe("image/png");
      expect(row?.extraFiles).toHaveLength(1);
      expect(row?.pageCount).toBe(2);
      expect(row?.sha256).toBe(sha256Of(photos));
    });

    it.each([
      ["nothing chosen", [] as Uint8Array[], /Choose the school notice/],
      ["an empty file", [new Uint8Array()], /Choose the school notice/],
      ["a file that is not a PDF or a photo", [new TextEncoder().encode("hello, this is text")], /PDF, or photos/],
      ["an iPhone HEIC photo", [Uint8Array.from([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0])], /JPEG or PNG/],
      ["a PDF and a photo together", [sampleNoticePdf(), sampleNoticePhotos()[0] as Uint8Array], /not both/],
      ["a PDF with more than 10 pages", [tinyPdf(11)], /more than 10 pages/],
      ["a damaged PDF", [new TextEncoder().encode("%PDF-1.4 this is not really a pdf")], /couldn't open this PDF/],
    ])("refuses %s with a plain message and stores nothing", async (_name, files, message) => {
      const before = storage.objects.size;
      const error = await upload(parentA, files, { nickname: "Test Child R" }).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(InputError);
      expect((error as InputError).fieldErrors.file).toMatch(message);
      expect(storage.objects.size).toBe(before);
    });

    it("refuses more than 10 MB and more than 10 photos", async () => {
      const big = new Uint8Array(10 * 1024 * 1024 + 1);
      big.set([0xff, 0xd8, 0xff]);
      const tooBig = await upload(parentA, [big], { nickname: "Test Child R" }).catch((caught: unknown) => caught);
      expect((tooBig as InputError).fieldErrors.file).toMatch(/under 10 MB/);
      const photo = sampleNoticePhotos()[0] as Uint8Array;
      const tooMany = await upload(parentA, Array.from({ length: 11 }, () => photo), { nickname: "Test Child R" }).catch((caught: unknown) => caught);
      expect((tooMany as InputError).fieldErrors.file).toMatch(/up to 10 photos/);
    });

    it("needs a child's name when the parent has no child yet", async () => {
      const fresh = (await insertParentProfile(db, "C")).id;
      const error = await uploadNotice(fresh, { files: [{ bytes: sampleNoticePdf() }] }, jobs, ctx()).catch((caught: unknown) => caught);
      expect((error as InputError).fieldErrors.nickname).toBeTruthy();
    });

    it("does not let one parent upload for another parent's child", async () => {
      const a = await uploadAndRead(parentA, [sampleNoticePdf()], { nickname: "Test Child O" });
      const [source] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, a.sourceId));
      const error = await uploadNotice(parentB, { childId: source?.childId, files: [{ bytes: sampleNoticePdf() }] }, jobs, ctx()).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(NotFoundError);
    });

    it("removes the stored file if the storage write fails part way", async () => {
      storage.failNextPut();
      const before = storage.objects.size;
      const error = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child S" }).catch((caught: unknown) => caught);
      expect((error as InputError).fieldErrors.file).toMatch(/couldn't save/);
      expect(storage.objects.size).toBe(before);
    });
  });

  describe("reading the notice (job)", () => {
    it("runs queued -> running -> succeeded and stores the Mathematics review", async () => {
      const { sourceId, jobId } = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child J" });
      expect((await getNoticeStatus(parentA, sourceId, { db, jobs }))?.status).toBe("queued");
      const finished = await jobs.run(jobId);
      expect(finished).toMatchObject({ status: "succeeded", attempts: 1, errorCode: null });
      const status = await getNoticeStatus(parentA, sourceId, { db, jobs });
      expect(status).toEqual({ status: "succeeded", failureCode: null });

      const [row] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      expect(row?.promptVersion).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/);
      const stored = row?.extraction as { review: { topics: { code: string; check: boolean }[]; appliesAcross: boolean; assessment: { date: string; durationMinutes: number }; notes: string[]; multipleSubjects: boolean }; raw: { subjects: unknown[] } };
      expect(stored.review.assessment).toMatchObject({ date: "2026-10-27", durationMinutes: 90 });
      expect(stored.review.topics).toHaveLength(11);
      expect(stored.review.topics.every((topic) => !topic.check)).toBe(true);
      expect(stored.review.appliesAcross).toBe(true);
      expect(stored.review.notes).toEqual(["Protractors are not allowed during examination"]);
      expect(stored.review.multipleSubjects).toBe(true);
      // Only the Mathematics entry of what the model read is kept.
      expect(stored.raw.subjects).toHaveLength(1);
      expect(JSON.stringify(row?.extraction)).not.toMatch(/Plant Parts|Mother Tongue/);
    });

    it("the photos read the same way as the PDF", async () => {
      const { sourceId } = await uploadAndRead(parentA, sampleNoticePhotos(), { nickname: "Test Child P2" });
      const screen = await getNoticeScreen(parentA, sourceId, { db, now: NOW, jobs });
      expect(screen?.state).toBe("found");
    });

    it("a file with no recorded reading is 'unreadable' and cannot simply be retried", async () => {
      const { sourceId, jobId } = await uploadAndRead(parentA, [tinyPdf(1)], { nickname: "Test Child X" });
      const [job] = await db.select().from(jobsTable).where(eq(jobsTable.id, jobId));
      expect(job).toMatchObject({ status: "failed", errorCode: "unreadable" });
      const screen = await getNoticeScreen(parentA, sourceId, { db, now: NOW, jobs });
      expect(screen).toMatchObject({ state: "failed", code: "unreadable", retry: false });
      await expect(retryNotice(parentA, sourceId, jobs, ctx())).rejects.toBeInstanceOf(InputError);
    });

    it("a notice with no Mathematics part fails as 'no_maths'", async () => {
      const scienceOnly = NoticeExtractionSchema.parse({ subjects: [{ subject: "Science", topics: [], notes: [] }] });
      const stub: AIService = { ...ai, extractSchoolNotice: async () => scienceOnly };
      const { sourceId } = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child M" });
      await processNoticeSource(sourceId, { db, ai: stub, storage, now: NOW }).catch(() => undefined);
      expect((await getNoticeStatus(parentA, sourceId, { db, jobs }))).toEqual({ status: "failed", failureCode: "no_maths" });
    });

    it("unavailable or slow reading keeps the file and can be tried again", async () => {
      const { sourceId, jobId } = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child T" });
      failNext = new AIError("unavailable", "down");
      await jobs.run(jobId);
      expect(await getNoticeScreen(parentA, sourceId, { db, now: NOW, jobs })).toMatchObject({ state: "failed", code: "ai_unavailable", retry: true });

      const retried = await retryNotice(parentA, sourceId, jobs, ctx());
      expect((await getNoticeStatus(parentA, sourceId, { db, jobs }))?.status).toBe("queued");
      await jobs.run(retried.jobId);
      expect((await getNoticeScreen(parentA, sourceId, { db, now: NOW, jobs }))?.state).toBe("found");

      const second = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child T2" });
      failNext = new AIError("timeout", "slow");
      await jobs.run(second.jobId);
      expect(await getNoticeScreen(parentA, second.sourceId, { db, now: NOW, jobs })).toMatchObject({ state: "failed", code: "timeout", retry: true });
    });

    it("marks topic wording the alias list does not know as 'Please check' when a model guesses, and as unmatched when it does not", async () => {
      const extraction = NoticeExtractionSchema.parse({
        subjects: [
          { subject: "Mathematics", date: "2026-10-27", durationMinutes: 90, assessmentType: "end_of_year", topics: [{ schoolLabel: "Symmetry", confident: true }, { schoolLabel: "Fractions", confident: true }, { schoolLabel: "Mystery topic", confident: true }], notes: [] },
        ],
      });
      const guesser: AIService = {
        ...ai,
        extractSchoolNotice: async () => extraction,
        mapTopics: async () => ({ mappings: [{ schoolLabel: "Symmetry", topicCodes: ["P3-MG-AN"] }, { schoolLabel: "Mystery topic", topicCodes: [] }] }),
      };
      const { sourceId } = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child G" });
      await processNoticeSource(sourceId, { db, ai: guesser, storage, now: NOW });
      const screen = await getNoticeScreen(parentA, sourceId, { db, now: NOW, jobs });
      if (screen?.state !== "found") throw new Error("expected found");
      expect(screen.view.topics.map((topic) => [topic.label, topic.check])).toEqual([
        ["Fractions", false],
        ["Angles and right angles", true],
      ]);
      expect(screen.view.unmatchedLabels).toEqual(["Mystery topic"]);
    });

    it("recovers a job stuck 'running' for over two minutes, once, and then gives up", async () => {
      let clock = NOW.getTime();
      const moving = createJobService({ db, now: () => new Date(clock) });
      let runs = 0;
      moving.register("test.stuck", async () => {
        runs += 1;
      });
      const job = await moving.enqueue("test.stuck", {});
      // Simulate a process that died right after taking the job.
      await db.update(jobsTable).set({ status: "running", attempts: 1, startedAt: new Date(clock) }).where(eq(jobsTable.id, job.id));
      expect(await moving.recover()).toBe(0);
      clock += STUCK_AFTER_MS + 1000;
      expect(await moving.recover()).toBe(1);
      expect(await moving.runOverdue(0)).toBe(1);
      expect(runs).toBe(1);
      expect((await db.select().from(jobsTable).where(eq(jobsTable.id, job.id)))[0]).toMatchObject({ status: "succeeded", attempts: 2 });

      // A second lost run is not retried again.
      const again = await moving.enqueue("test.stuck", {});
      await db.update(jobsTable).set({ status: "running", attempts: 2, startedAt: new Date(clock) }).where(eq(jobsTable.id, again.id));
      clock += STUCK_AFTER_MS + 1000;
      expect(await moving.recover()).toBe(1);
      expect((await db.select().from(jobsTable).where(eq(jobsTable.id, again.id)))[0]).toMatchObject({ status: "failed", errorCode: "stuck" });
    });

    it("reading a source's status gives a job nobody started its chance", async () => {
      let clock = NOW.getTime();
      const late = createJobService({ db, now: () => new Date(clock) });
      late.register(NOTICE_EXTRACTION_JOB, async (payload) => {
        await processNoticeSource(String(payload.sourceId), { db, ai, storage, now: NOW });
      });
      const { sourceId } = await uploadNotice(parentA, { newChildNickname: "Test Child L", files: [{ bytes: sampleNoticePdf() }] }, late, ctx());
      clock += 30_000;
      const status = await getNoticeStatus(parentA, sourceId, { db, jobs: late });
      expect(status?.status).toBe("succeeded");
    });

    it("two runners cannot take the same job", async () => {
      const service = createJobService({ db });
      let runs = 0;
      service.register("test.once", async () => {
        runs += 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
      });
      const job = await service.enqueue("test.once", {});
      await Promise.all([service.run(job.id), service.run(job.id)]);
      expect(runs).toBe(1);
    });
  });

  describe("Looks right", () => {
    it("creates the assessment, saves the format, confirms the topics and links the notice", async () => {
      const { sourceId } = await uploadAndRead(parentA, [sampleNoticePdf()], { nickname: "Test Child K" });
      const screen = await getNoticeScreen(parentA, sourceId, { db, now: NOW, jobs });
      if (screen?.state !== "found") throw new Error("expected found");
      const view = screen.view;
      expect(view.assessment).toMatchObject({ typeLabel: "End-of-year exam", dateText: "Tue 27 Oct", durationText: "1 h 30 min" });
      expect(view.format?.parts.map((part) => part.summary)).toEqual([
        "Section A: 6 multiple-choice, 12 marks",
        "Section B: 16 short-answer, 26 marks",
        "Section C: 4 word problems, 12 marks",
      ]);
      expect(view.format?.totalMarks).toBe(50);
      expect(view.topics.map((topic) => topic.label)).toContain("Fractions");
      expect(view.futureLabel).toBe("Use this format for Test Child K's future end-of-year exam papers");

      const { assessmentId } = await confirmNotice(
        parentA,
        sourceId,
        {
          type: view.assessment.type,
          date: view.assessment.date,
          topicCodes: view.topics.map((topic) => topic.code),
          format: { durationMinutes: 90, sections: view.format?.parts.map((part) => ({ label: part.label, kind: part.kind, questionCount: part.questionCount, totalMarks: part.totalMarks })) },
        },
        ctx(),
      );

      const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
      expect(assessment).toMatchObject({ assessmentType: "end_of_year", name: "End-of-year exam", date: "2026-10-27", status: "scope_confirmed" });
      const setup = await getAssessmentSetup(parentA, assessmentId, { db, now: NOW });
      expect(setup?.summary).toContain("50 marks · 1 h 30 min · Sections A, B, C");
      expect(setup?.assessment.scopeConfirmed).toBe(true);
      const saved = await db.select().from(schoolPaperFormats).where(eq(schoolPaperFormats.childId, assessment?.childId ?? ""));
      expect(saved).toHaveLength(1);

      const [source] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      expect(source?.assessmentId).toBe(assessmentId);
      expect((await getNoticeScreen(parentA, sourceId, { db, now: NOW, jobs }))).toEqual({ state: "confirmed", assessmentId });
      // Confirming again returns the same assessment and creates nothing more.
      const again = await confirmNotice(parentA, sourceId, { type: "end_of_year", date: "2026-10-27", topicCodes: ["P3-NA-FR"], format: undefined, durationMinutes: 90 }, ctx());
      expect(again.assessmentId).toBe(assessmentId);
    });

    it("can leave the format unremembered", async () => {
      const { sourceId } = await uploadAndRead(parentA, [sampleNoticePdf()], { nickname: "Test Child N" });
      const format = { durationMinutes: 90, sections: [{ label: "Section A", kind: "mcq", questionCount: 20, totalMarks: 30 }, { label: "Section B", kind: "short", questionCount: 20, totalMarks: 30 }] };
      const { assessmentId } = await confirmNotice(parentA, sourceId, { type: "end_of_year", date: "2026-10-27", topicCodes: ["P3-NA-FR", "P3-MG-TM"], format, saveForFuture: false }, ctx());
      const [assessment] = await db.select().from(assessments).where(eq(assessments.id, assessmentId));
      expect(await db.select().from(schoolPaperFormats).where(eq(schoolPaperFormats.childId, assessment?.childId ?? ""))).toHaveLength(0);
    });

    it("checks everything first and leaves no half-made assessment behind", async () => {
      const { sourceId } = await uploadAndRead(parentA, [sampleNoticePdf()], { nickname: "Test Child V" });
      const before = (await db.select().from(assessments)).length;
      const bad = await confirmNotice(
        parentA,
        sourceId,
        {
          type: "end_of_year",
          date: "2026-09-01",
          topicCodes: [],
          format: { durationMinutes: 90, sections: [{ label: "Section A", kind: "mcq", questionCount: 6, totalMarks: 50 }] },
        },
        ctx(),
      ).catch((caught: unknown) => caught);
      expect(bad).toBeInstanceOf(InputError);
      const errors = (bad as InputError).fieldErrors;
      expect(errors.date).toMatch(/today or a later date/);
      expect(errors.topics).toMatch(/Tick at least one topic/);
      expect(errors["part-0"]).toMatch(/can't add up to 50 marks/);
      expect((await db.select().from(assessments)).length).toBe(before);
      const [source] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      expect(source?.assessmentId).toBeNull();
    });

    it("uses the time from the notice when it gave no parts, and asks when there is neither", async () => {
      const bare = NoticeExtractionSchema.parse({
        subjects: [{ subject: "Mathematics", date: "2026-10-27", durationMinutes: 90, assessmentType: "wa2", topics: [{ schoolLabel: "Fractions", confident: true }], notes: [] }],
      });
      const stub: AIService = { ...ai, extractSchoolNotice: async () => bare };
      const { sourceId } = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child W" });
      await processNoticeSource(sourceId, { db, ai: stub, storage, now: NOW });
      const missing = await confirmNotice(parentA, sourceId, { type: "wa2", date: "2026-10-27", topicCodes: ["P3-NA-FR"] }, ctx()).catch((caught: unknown) => caught);
      expect((missing as InputError).fieldErrors.duration).toMatch(/between 15 and 120 minutes/);
      const { assessmentId } = await confirmNotice(parentA, sourceId, { type: "wa2", date: "2026-10-27", topicCodes: ["P3-NA-FR"], durationMinutes: 60 }, ctx());
      const setup = await getAssessmentSetup(parentA, assessmentId, { db, now: NOW });
      expect(setup?.summary).toContain("1 h");
    });

    it("cannot confirm before the reading has finished", async () => {
      const { sourceId } = await upload(parentA, [sampleNoticePdf()], { nickname: "Test Child Q" });
      await expect(confirmNotice(parentA, sourceId, { type: "wa2", date: "2026-10-27", topicCodes: ["P3-NA-FR"], durationMinutes: 60 }, ctx())).rejects.toBeInstanceOf(InputError);
    });
  });

  describe("ownership and deleting the file", () => {
    it("another parent gets nothing: no status, no screen, no confirm, no retry, no delete", async () => {
      const { sourceId } = await uploadAndRead(parentA, [sampleNoticePdf()], { nickname: "Test Child Z" });
      expect(await getNoticeStatus(parentB, sourceId, { db, jobs })).toBeNull();
      expect(await getNoticeScreen(parentB, sourceId, { db, now: NOW, jobs })).toBeNull();
      await expect(confirmNotice(parentB, sourceId, { type: "wa2", date: "2026-10-27", topicCodes: ["P3-NA-FR"], durationMinutes: 60 }, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(retryNotice(parentB, sourceId, jobs, ctx())).rejects.toBeInstanceOf(NotFoundError);
      await expect(deleteNoticeFile(parentB, sourceId, ctx())).rejects.toBeInstanceOf(NotFoundError);
      expect(await getNoticeStatus(parentA, "not-a-uuid", { db, jobs })).toBeNull();
      // The owner's file is untouched.
      const [row] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      expect(await storage.exists({ bucket: "assessment-source-uploads", key: row?.objectKey ?? "" })).toBe(true);
      expect(row?.fileDeletedAt).toBeNull();
    });

    it("'Delete this file' removes every stored page and clears what was read", async () => {
      const { sourceId } = await uploadAndRead(parentA, sampleNoticePhotos(), { nickname: "Test Child D" });
      const [before] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      const keys = [before?.objectKey ?? "", ...(before?.extraFiles ?? []).map((file) => file.objectKey)];
      expect(keys).toHaveLength(2);
      for (const key of keys) expect(await storage.exists({ bucket: "assessment-source-uploads", key })).toBe(true);

      await deleteNoticeFile(parentA, sourceId, ctx());

      for (const key of keys) expect(await storage.exists({ bucket: "assessment-source-uploads", key })).toBe(false);
      const [after] = await db.select().from(assessmentSources).where(eq(assessmentSources.id, sourceId));
      expect(after?.extraction).toBeNull();
      expect(after?.fileDeletedAt).not.toBeNull();
      expect(await getNoticeStatus(parentA, sourceId, { db, jobs })).toBeNull();
      await expect(deleteNoticeFile(parentA, sourceId, ctx())).rejects.toBeInstanceOf(NotFoundError);
      const audit = await db.select().from(auditLogs).where(eq(auditLogs.entityId, sourceId));
      expect(audit.map((event) => event.action)).toContain("assessment_source.file_deleted");
    });

    it("deleting the file does not remove an assessment already made from it", async () => {
      const { sourceId } = await uploadAndRead(parentA, [sampleNoticePdf()], { nickname: "Test Child E" });
      const { assessmentId } = await confirmNotice(parentA, sourceId, { type: "end_of_year", date: "2026-10-27", topicCodes: ["P3-NA-FR"], durationMinutes: 90 }, ctx());
      await deleteNoticeFile(parentA, sourceId, ctx());
      expect((await db.select().from(assessments).where(eq(assessments.id, assessmentId))).length).toBe(1);
    });
  });

  it("read the fixture provider only", () => {
    // The tests above never call a model: only the recorded fixtures were used.
    expect(extractionCalls).toBeGreaterThan(0);
    expect(ai.provider).toBe("fixture");
  });
});
