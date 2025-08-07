import { GitException } from '../exceptions';

export class RepositoryException extends GitException {
  constructor(message: string) {
    super(message);
    this.name = 'RepositoryException';
  }
}
