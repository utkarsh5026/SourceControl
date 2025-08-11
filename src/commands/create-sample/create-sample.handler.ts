import { FileUtils } from '@/utils';
import path from 'path';
import { DirectoryNode, GenerationStats } from './create-sample.types';

/**
 * Sample content generators for different file types
 */
export class ContentGenerators {
  private static readonly LOREM_WORDS = [
    'lorem',
    'ipsum',
    'dolor',
    'sit',
    'amet',
    'consectetur',
    'adipiscing',
    'elit',
    'sed',
    'do',
    'eiusmod',
    'tempor',
    'incididunt',
    'ut',
    'labore',
    'et',
    'dolore',
    'magna',
    'aliqua',
    'enim',
    'ad',
    'minim',
    'veniam',
    'quis',
    'nostrud',
    'exercitation',
    'ullamco',
    'laboris',
    'nisi',
    'aliquip',
    'ex',
    'ea',
    'commodo',
    'consequat',
    'duis',
    'aute',
    'irure',
    'in',
    'reprehenderit',
    'voluptate',
    'velit',
    'esse',
    'cillum',
    'fugiat',
    'nulla',
    'pariatur',
    'excepteur',
    'sint',
    'occaecat',
    'cupidatat',
    'non',
    'proident',
    'sunt',
    'culpa',
    'qui',
    'officia',
    'deserunt',
    'mollit',
    'anim',
    'id',
    'est',
    'laborum',
  ];

  static generateMarkdown(filename: string): string {
    const title = filename.replace('.md', '').replace(/[-_]/g, ' ');
    const wordCount = this.randomInt(50, 200);
    const content = this.generateWords(wordCount);

    return `# ${this.capitalize(title)}

## Overview

${content}

## Features

${this.generateBulletList(3, 8)}

## Usage

\`\`\`bash
npm install
npm start
\`\`\`

## Configuration

${this.generateWords(30, 80)}

### Example

\`\`\`json
{
  "version": "1.0.0",
  "config": {
    "enabled": true,
    "timeout": ${this.randomInt(1000, 5000)}
  }
}
\`\`\`

## Contributing

${this.generateWords(20, 50)}
`;
  }

  static generateTypeScript(filename: string): string {
    const className = this.toPascalCase(filename.replace('.ts', ''));
    const methodCount = this.randomInt(2, 5);

    let content = `/**
 * ${this.generateWords(5, 15)}
 */
export class ${className} {
  private readonly _data: Map<string, any> = new Map();

  constructor(private config: ${className}Config = {}) {
    this.initialize();
  }

  private initialize(): void {
    // ${this.generateWords(3, 8)}
    console.log('Initializing ${className}...');
  }
`;

    for (let i = 0; i < methodCount; i++) {
      const methodName = this.generateCamelCaseWord();
      const paramType = this.randomChoice(['string', 'number', 'boolean', 'object']);

      content += `
  public ${methodName}(value: ${paramType}): ${this.randomChoice(['void', 'Promise<void>', 'boolean', 'string'])} {
    // ${this.generateWords(3, 10)}
    this._data.set('${methodName}', value);
    ${this.randomChoice([
      'return true;',
      'return Promise.resolve();',
      'console.log(`${methodName} executed with:`, value);',
      'throw new Error("Not implemented");',
    ])}
  }`;
    }

    content += `
}

interface ${className}Config {
  enabled?: boolean;
  timeout?: number;
  retries?: number;
}
`;

    return content;
  }

  static generateJSON(filename: string): string {
    const structure = {
      name: filename.replace('.json', ''),
      version: `${this.randomInt(1, 5)}.${this.randomInt(0, 20)}.${this.randomInt(0, 50)}`,
      description: this.generateWords(5, 15),
      author: this.generatePersonName(),
      license: this.randomChoice(['MIT', 'Apache-2.0', 'BSD-3-Clause', 'GPL-3.0']),
      keywords: this.generateArray(3, 8, () => this.generateWord()),
      config: {
        environment: this.randomChoice(['development', 'production', 'testing']),
        debug: this.randomBoolean(),
        port: this.randomInt(3000, 9000),
        features: {
          authentication: this.randomBoolean(),
          logging: this.randomBoolean(),
          caching: this.randomBoolean(),
          monitoring: this.randomBoolean(),
        },
      },
      dependencies: this.generateDependencies(),
    };

    return JSON.stringify(structure, null, 2);
  }

  static generateTextFile(): string {
    const paragraphs = this.randomInt(2, 6);
    const content: string[] = [];

    for (let i = 0; i < paragraphs; i++) {
      const sentences = this.randomInt(3, 8);
      const paragraph: string[] = [];

      for (let j = 0; j < sentences; j++) {
        const words = this.randomInt(5, 20);
        const sentence = this.capitalize(this.generateWords(words)) + '.';
        paragraph.push(sentence);
      }

      content.push(paragraph.join(' '));
    }

    return content.join('\n\n');
  }

  static generateCSV(): string {
    const headers = ['id', 'name', 'email', 'department', 'salary', 'start_date', 'active'];
    const rows = [headers.join(',')];

    const rowCount = this.randomInt(10, 50);
    for (let i = 1; i <= rowCount; i++) {
      const row = [
        i.toString(),
        this.generatePersonName(),
        this.generateEmail(),
        this.randomChoice(['Engineering', 'Marketing', 'Sales', 'HR', 'Finance', 'Operations']),
        this.randomInt(40000, 150000).toString(),
        this.generateDate(),
        this.randomBoolean().toString(),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  // Utility methods
  private static randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  private static randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]!;
  }

  private static randomBoolean(): boolean {
    return Math.random() < 0.5;
  }

  private static generateWords(minWords: number, maxWords?: number): string {
    const wordCount = maxWords ? this.randomInt(minWords, maxWords) : minWords;
    const words: string[] = [];

    for (let i = 0; i < wordCount; i++) {
      words.push(this.randomChoice(this.LOREM_WORDS));
    }

    return words.join(' ');
  }

  private static generateWord(): string {
    return this.randomChoice(this.LOREM_WORDS);
  }

  private static capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1);
  }

  private static toPascalCase(text: string): string {
    return text
      .split(/[-_\s]/)
      .map((word) => this.capitalize(word))
      .join('');
  }

  private static generateCamelCaseWord(): string {
    const words = this.randomInt(1, 3);
    const parts: string[] = [];

    for (let i = 0; i < words; i++) {
      const word = this.generateWord();
      parts.push(i === 0 ? word : this.capitalize(word));
    }

    return parts.join('');
  }

  private static generateBulletList(minItems: number, maxItems: number): string {
    const itemCount = this.randomInt(minItems, maxItems);
    const items: string[] = [];

    for (let i = 0; i < itemCount; i++) {
      items.push(`- ${this.capitalize(this.generateWords(3, 10))}`);
    }

    return items.join('\n');
  }

  private static generatePersonName(): string {
    const firstNames = [
      'Alice',
      'Bob',
      'Charlie',
      'Diana',
      'Eve',
      'Frank',
      'Grace',
      'Henry',
      'Ivy',
      'Jack',
    ];
    const lastNames = [
      'Smith',
      'Johnson',
      'Williams',
      'Brown',
      'Jones',
      'Garcia',
      'Miller',
      'Davis',
      'Rodriguez',
      'Martinez',
    ];

    return `${this.randomChoice(firstNames)} ${this.randomChoice(lastNames)}`;
  }

  private static generateEmail(): string {
    const domains = ['example.com', 'test.org', 'demo.net', 'sample.io', 'mock.dev'];
    const name = this.generatePersonName().toLowerCase().replace(' ', '.');
    return `${name}@${this.randomChoice(domains)}`;
  }

  private static generateDate(): string {
    const year = this.randomInt(2020, 2024);
    const month = this.randomInt(1, 12).toString().padStart(2, '0');
    const day = this.randomInt(1, 28).toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private static generateArray<T>(minLength: number, maxLength: number, generator: () => T): T[] {
    const length = this.randomInt(minLength, maxLength);
    const result: T[] = [];

    for (let i = 0; i < length; i++) {
      result.push(generator());
    }

    return result;
  }

  private static generateDependencies(): Record<string, string> {
    const packages = [
      'express',
      'lodash',
      'moment',
      'axios',
      'react',
      'vue',
      'angular',
      'typescript',
      'webpack',
      'babel',
    ];
    const deps: Record<string, string> = {};
    const count = this.randomInt(3, 8);

    for (let i = 0; i < count; i++) {
      const pkg = this.randomChoice(packages);
      const version = `^${this.randomInt(1, 10)}.${this.randomInt(0, 20)}.${this.randomInt(0, 50)}`;
      deps[pkg] = version;
    }

    return deps;
  }
}

/**
 * Generates sample directory structures and files for testing
 */
export class SampleGenerator {
  private stats: GenerationStats = {
    totalDirectories: 0,
    totalFiles: 0,
    totalSize: 0,
    structure: { name: '', path: '', files: [], subdirectories: [] },
  };

  constructor(
    private maxDirs: number,
    private maxFiles: number,
    private maxDepth: number
  ) {}

  async generateSample(basePath: string): Promise<GenerationStats> {
    this.stats = {
      totalDirectories: 0,
      totalFiles: 0,
      totalSize: 0,
      structure: { name: path.basename(basePath), path: basePath, files: [], subdirectories: [] },
    };

    await FileUtils.createDirectories(basePath);
    await this.generateDirectoryStructure(basePath, 0, this.stats.structure);

    return this.stats;
  }

  private async generateDirectoryStructure(
    currentPath: string,
    currentDepth: number,
    node: DirectoryNode
  ): Promise<void> {
    // Generate files in current directory
    const fileCount = this.randomInt(1, Math.min(this.maxFiles, 8));

    for (let i = 0; i < fileCount; i++) {
      const { filename, content } = this.generateRandomFile();
      const filePath = path.join(currentPath, filename);

      await FileUtils.createFile(filePath, content);

      node.files.push(filename);
      this.stats.totalFiles++;
      this.stats.totalSize += content.length;
    }

    // Generate subdirectories if we haven't reached max depth
    if (currentDepth < this.maxDepth) {
      const dirCount = this.randomInt(0, Math.min(this.maxDirs, 4));

      for (let i = 0; i < dirCount; i++) {
        const dirName = this.generateDirectoryName();
        const dirPath = path.join(currentPath, dirName);

        await FileUtils.createDirectories(dirPath);

        const childNode: DirectoryNode = {
          name: dirName,
          path: dirPath,
          files: [],
          subdirectories: [],
        };

        node.subdirectories.push(childNode);
        this.stats.totalDirectories++;

        // Recursively generate subdirectory content
        await this.generateDirectoryStructure(dirPath, currentDepth + 1, childNode);
      }
    }
  }

  private generateRandomFile(): { filename: string; content: string } {
    const fileTypes = [
      { ext: '.md', weight: 3, generator: ContentGenerators.generateMarkdown },
      { ext: '.ts', weight: 3, generator: ContentGenerators.generateTypeScript },
      { ext: '.json', weight: 2, generator: ContentGenerators.generateJSON },
      { ext: '.txt', weight: 2, generator: ContentGenerators.generateTextFile },
      { ext: '.csv', weight: 1, generator: ContentGenerators.generateCSV },
    ];

    // Weighted random selection
    const totalWeight = fileTypes.reduce((sum, type) => sum + type.weight, 0);
    let random = Math.random() * totalWeight;

    for (const fileType of fileTypes) {
      random -= fileType.weight;
      if (random <= 0) {
        const baseName = this.generateFileName();
        const filename = baseName + fileType.ext;
        const content = fileType.generator(filename);

        return { filename, content };
      }
    }

    // Fallback
    const filename = this.generateFileName() + '.txt';
    return { filename, content: ContentGenerators.generateTextFile() };
  }

  private generateFileName(): string {
    const patterns = [
      () => this.randomChoice(['index', 'main', 'app', 'core', 'utils', 'helpers', 'config']),
      () =>
        this.randomChoice(['user', 'admin', 'client', 'server', 'api', 'data']) +
        '-' +
        this.randomChoice(['manager', 'service', 'controller', 'model', 'handler']),
      () =>
        this.randomChoice(['test', 'spec', 'mock', 'demo', 'sample']) +
        '-' +
        this.randomChoice(['data', 'config', 'setup', 'env']),
      () => this.randomWord() + '-' + this.randomWord(),
      () => this.randomChoice(['README', 'CHANGELOG', 'LICENSE', 'CONTRIBUTING']),
    ];

    return this.randomChoice(patterns)();
  }

  private generateDirectoryName(): string {
    const patterns = [
      () => this.randomChoice(['src', 'lib', 'dist', 'build', 'public', 'assets']),
      () => this.randomChoice(['components', 'services', 'utils', 'helpers', 'models', 'types']),
      () => this.randomChoice(['tests', 'specs', 'mocks', 'fixtures', 'samples']),
      () => this.randomChoice(['config', 'scripts', 'tools', 'docs', 'examples']),
      () => this.randomWord() + '-' + this.randomChoice(['module', 'package', 'bundle', 'core']),
    ];

    return this.randomChoice(patterns)();
  }

  private randomWord(): string {
    const words = [
      'alpha',
      'beta',
      'gamma',
      'delta',
      'epsilon',
      'zeta',
      'theta',
      'lambda',
      'sigma',
      'omega',
      'phoenix',
      'nexus',
      'vertex',
      'matrix',
      'vector',
      'quantum',
      'stellar',
      'cosmic',
      'neural',
      'digital',
      'cyber',
      'meta',
    ];
    return this.randomChoice(words);
  }

  private randomChoice<T>(array: T[]): T {
    return array[Math.floor(Math.random() * array.length)]!;
  }

  private randomInt(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
}
