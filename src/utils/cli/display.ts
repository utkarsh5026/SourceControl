import boxen, { Options as BoxenOptions } from 'boxen';
import chalk from 'chalk';

/**
 * Standard boxen configuration used across all commands
 */
const DEFAULT_BOX_OPTIONS: Partial<BoxenOptions> = {
  padding: 1,
  margin: { top: 1, bottom: 1, left: 1, right: 1 },
  borderStyle: 'round',
  backgroundColor: 'black',
  titleAlignment: 'center',
};

/**
 * Color themes for different types of displays
 */
export const DisplayThemes = {
  INFO: 'blue',
  SUCCESS: 'green',
  WARNING: 'yellow',
  ERROR: 'red',
  NEUTRAL: 'gray',
  HIGHLIGHT: 'magenta',
} as const;

export type DisplayTheme = (typeof DisplayThemes)[keyof typeof DisplayThemes];

interface DisplayBoxOptions {
  title?: string;
  titleAlignment?: 'left' | 'center' | 'right';
  theme?: DisplayTheme;
  customBorderColor?: string;
}

/**
 * Creates a standardized boxen display with consistent styling
 */
export const createDisplayBox = (content: string, options: DisplayBoxOptions = {}): string => {
  const { theme = DisplayThemes.INFO, customBorderColor } = options;

  const boxOptions: BoxenOptions = {
    ...DEFAULT_BOX_OPTIONS,
    borderColor: customBorderColor || theme,
  };

  return boxen(content, boxOptions);
};

/**
 * Displays a boxen to console with standard formatting
 */
export const displayBox = (content: string, options: DisplayBoxOptions = {}): void => {
  console.log(createDisplayBox(content, options));
};

/**
 * Creates formatted label-value pairs commonly used in command outputs
 */
export const formatLabelValue = (label: string, value: string): string => {
  return `${chalk.gray(`${label}:`)} ${value}`;
};

/**
 * Creates a separator line
 */
export const createSeparator = (length: number = 50, char: string = '─'): string => {
  return chalk.gray(char.repeat(length));
};

/**
 * Pre-configured display functions for common use cases
 */
export const display = {
  /**
   * Display success message with green theme
   */
  success: (content: string, title: string) =>
    displayBox(content, { theme: DisplayThemes.SUCCESS, title }),

  /**
   * Display error message with red theme
   */
  error: (content: string, title: string) =>
    displayBox(content, { theme: DisplayThemes.ERROR, title }),

  /**
   * Display warning message with yellow theme
   */
  warning: (content: string, title: string) =>
    displayBox(content, { theme: DisplayThemes.WARNING, title }),

  /**
   * Display info message with blue theme
   */
  info: (content: string, title: string) =>
    displayBox(content, { theme: DisplayThemes.INFO, title }),

  /**
   * Display highlighted message with magenta theme
   */
  highlight: (content: string, title: string) =>
    displayBox(content, { theme: DisplayThemes.HIGHLIGHT, title }),
};
