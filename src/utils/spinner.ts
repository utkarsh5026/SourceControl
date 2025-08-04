import ora, { Ora } from 'ora';
import { SpinnerOptions } from '../types';

export class SpinnerManager {
  private spinner: Ora | null = null;

  start(options: SpinnerOptions): void {
    if (this.spinner) {
      this.stop();
    }

    this.spinner = ora({
      text: options.text,
      color: options.color || 'cyan',
    }).start();
  }

  update(text: string): void {
    if (this.spinner) {
      this.spinner.text = text;
    }
  }

  succeed(text?: string): void {
    if (this.spinner) {
      this.spinner.succeed(text);
      this.spinner = null;
    }
  }

  fail(text?: string): void {
    if (this.spinner) {
      this.spinner.fail(text);
      this.spinner = null;
    }
  }

  stop(): void {
    if (this.spinner) {
      this.spinner.stop();
      this.spinner = null;
    }
  }

  info(text: string): void {
    if (this.spinner) {
      this.spinner.info(text);
      this.spinner = null;
    }
  }

  warn(text: string): void {
    if (this.spinner) {
      this.spinner.warn(text);
      this.spinner = null;
    }
  }
}

export const spinner = new SpinnerManager();
