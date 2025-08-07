import { GitException } from '../exceptions';

export class RepositoryException extends GitException {
  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'RepositoryException';
    this.cause = cause;
  }
}
