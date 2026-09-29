/** The signed-in person is not allowed to do or see this. Callers show a calm message or a 404. */
export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** The thing does not exist, or belongs to someone else. Callers show a 404; the two are never told apart. */
export class NotFoundError extends Error {
  constructor(message = "We can't find that.") {
    super(message);
    this.name = "NotFoundError";
  }
}

/** The input is not acceptable. `fieldErrors` holds plain-words messages keyed by form field name. */
export class InputError extends Error {
  readonly fieldErrors: Record<string, string>;
  constructor(fieldErrors: Record<string, string>) {
    super(Object.values(fieldErrors)[0] ?? "Check what you entered and try again.");
    this.name = "InputError";
    this.fieldErrors = fieldErrors;
  }
}
