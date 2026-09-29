/** The signed-in person is not allowed to do or see this. Callers show a calm message or a 404. */
export class ForbiddenError extends Error {
  constructor(message = "You do not have access to this.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
