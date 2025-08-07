/**
 * Commit Person Structure:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │ Name <email> timestamp timezone                                 │
 * └─────────────────────────────────────────────────────────────────┘
 */
export class CommitPerson {
  readonly name: string;
  readonly email: string;
  readonly timestamp: number;
  readonly timezone: string;

  constructor(name: string, email: string, timestamp: number, timezone: string) {
    this.name = this.validateName(name);
    this.email = this.validateEmail(email);
    this.timestamp = timestamp;
    this.timezone = timezone;
  }

  /**
   * Validates the name and throws an error if it is null or empty
   */
  private validateName(name: string): string {
    if (name == null || name.trim().length === 0) {
      throw new Error('Name cannot be null or empty');
    }
    return name.trim();
  }

  /**
   * Validates the email and throws an error if it is null or empty or does not contain an @
   */
  private validateEmail(email: string): string {
    if (email == null || email.trim().length === 0) {
      throw new Error('Email cannot be null or empty');
    }

    if (!email.includes('@')) {
      throw new Error(`Invalid email format: ${email}`);
    }
    return email.trim();
  }

  /**
   * Formats person information in Git's standard format:
   * "Name <email> timestamp timezone"
   */
  formatForGit(): string {
    const epochSeconds = this.timestamp.toString();
    const tzString = this.formatTimezone(this.timezone);
    return `${this.name} <${this.email}> ${epochSeconds} ${tzString}`;
  }

  /**
   * Formats the timezone in the format "+HHMM" or "-HHMM"
   */
  private formatTimezone(timezone: string): string {
    const totalSeconds = parseInt(timezone, 10);
    const hours = Math.floor(Math.abs(totalSeconds) / 3600);
    const minutes = Math.floor((Math.abs(totalSeconds) % 3600) / 60);
    const sign = totalSeconds >= 0 ? '+' : '-';
    return `${sign}${hours.toString().padStart(2, '0')}${minutes.toString().padStart(2, '0')}`;
  }

  /**
   * Parses person information from Git's format.
   */
  static parseFromGit(gitFormat: string): CommitPerson {
    // Pattern: "Name <email> timestamp timezone"
    const pattern = new RegExp('^(.+) <([^>]+)> (\\d+) ([+-]\\d{4})$');
    const matcher = pattern.exec(gitFormat);
    if (!matcher) {
      throw new Error(`Invalid person format: ${gitFormat}`);
    }

    const name = matcher[1] ?? '';
    const email = matcher[2] ?? '';
    const epochSeconds = parseInt(matcher[3] ?? '0', 10);
    const tzString = matcher[4] ?? '';
    const timezone = CommitPerson.parseTimezone(tzString);

    return new CommitPerson(name, email, epochSeconds, timezone);
  }

  /**
   * Parses the timezone from the string and returns the total offset in seconds
   */
  private static parseTimezone(tzString: string): string {
    if (tzString.length !== 5 || (tzString.charAt(0) !== '+' && tzString.charAt(0) !== '-')) {
      throw new Error(`Invalid timezone format: ${tzString}`);
    }

    const sign = tzString.charAt(0) === '+' ? 1 : -1;
    const hours = parseInt(tzString.substring(1, 3), 10);
    const minutes = parseInt(tzString.substring(3, 5), 10);

    // Return total offset in seconds, not formatted string
    const totalSeconds = sign * (hours * 3600 + minutes * 60);
    return totalSeconds.toString();
  }
}
