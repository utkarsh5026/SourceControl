export class GitException extends Error {
  constructor(message: string) {
    super(message);
  }
}

export class ObjectException extends GitException {
  constructor(message: string) {
    super(message);
  }
}
