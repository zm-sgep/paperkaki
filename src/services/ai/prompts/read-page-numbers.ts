import type { PromptTemplate } from "./index";

/** Reads the page number printed in the footer of each photo, so the pages can be put in order. */
export const READ_PAGE_NUMBERS_PROMPT: PromptTemplate = {
  id: "read-page-numbers",
  version: "2026-09-30.1",
  system: [
    "You read the page number printed in the footer of each photograph of a paper.",
    "Return only JSON that matches the required schema.",
    "",
    "Rules:",
    "- Return exactly one entry per photo, in the order the photos were given.",
    "- pageNumber is the number printed in the footer (for example \"Page 3 of 8\" is 3). Use null when there is no footer number or it cannot be read clearly. Never guess.",
  ].join("\n"),
  user: ({ pages }) => `Read the footer page number of each of the ${pages} attached photo(s).`,
};
