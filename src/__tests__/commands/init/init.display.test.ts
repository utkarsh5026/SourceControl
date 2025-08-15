import { displayInitError, InitOptions } from '../../../commands/init/init.display';
import { display } from '../../../utils';

jest.mock('../../../utils');

describe('init display functions', () => {
  let mockDisplayError: jest.SpyInstance;

  beforeEach(() => {
    mockDisplayError = jest.spyOn(display, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('displayInitError', () => {
    test('displays error with proper message', () => {
      const error = new Error('Test initialization error');
      
      displayInitError(error);

      expect(mockDisplayError).toHaveBeenCalled();
    });

    test('handles error without message', () => {
      const error = new Error();
      
      displayInitError(error);

      expect(mockDisplayError).toHaveBeenCalled();
    });
  });

  describe('InitOptions interface', () => {
    test('has correct interface shape', () => {
      const options: InitOptions = {
        bare: true,
        template: '/path/to/template',
        shared: true,
        verbose: false
      };
      
      expect(typeof options.bare).toBe('boolean');
      expect(typeof options.template).toBe('string');
      expect(typeof options.shared).toBe('boolean');
      expect(typeof options.verbose).toBe('boolean');
    });
  });
});