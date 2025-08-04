export class SourceControlException extends Error {
  public constructor(message: string) {
    super(message);
  }
}

export class ObjectException extends SourceControlException {
  public constructor(message: string) {
    super(message);
  }
}

export class RepositoryException extends SourceControlException {
  public constructor(message: string) {
    super(message);
  }
}
