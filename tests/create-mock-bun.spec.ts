import { describe, it, expect } from 'bun:test';
import {
  createMock,
  createMockWithDefaults,
  getCallInfo,
  isMock,
  type DeepMocked,
} from '../src';

/**
 * Test interfaces mirroring real-world scenarios
 */
interface User {
  id: string;
  name: string;
  email: string;
}

interface UserRepository {
  findById(id: string): Promise<User | null>;
  findAll(): Promise<User[]>;
  create(user: Partial<User>): Promise<User>;
  update(id: string, user: Partial<User>): Promise<User>;
  delete(id: string): Promise<boolean>;
  count(): Promise<number>;
  query(filter: Record<string, any>): Promise<User[]>;
}

interface CacheService {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T, ttl?: number): void;
  delete(key: string): boolean;
  clear(): void;
}

interface UserService {
  getUser(id: string): Promise<User>;
  getAllUsers(): Promise<User[]>;
  createUser(data: Partial<User>): Promise<User>;
  updateUser(id: string, data: Partial<User>): Promise<User>;
  deleteUser(id: string): Promise<boolean>;
  cache: CacheService;
  repository: UserRepository;
}

describe('createMock', () => {
  describe('basic mocking', () => {
    it('should create a mock function', () => {
      const mockFn = createMock<() => string>();
      expect(typeof mockFn).toBe('function');
      expect(isMock(mockFn)).toBe(true);
    });

    it('should track function calls', () => {
      const mockFn = createMock<(x: number) => number>();
      mockFn(42);
      mockFn(100);

      const info = getCallInfo(mockFn);
      expect(info.callCount).toBe(2);
      expect(info.calls).toEqual([[42], [100]]);
    });

    it('should return nested mocks by default', () => {
      const mockFn = createMock<() => { name: string }>();
      const result = mockFn();
      expect(result).toBeDefined();
      expect(typeof result).toBe('function'); // Nested mock is also a function/proxy
    });
  });

  describe('async mocking', () => {
    it('should mock async functions', async () => {
      const mockFn = createMock<(id: string) => Promise<User>>();
      mockFn.mockResolvedValue({ id: '1', name: 'John', email: 'john@example.com' });

      const result = await mockFn('1');
      expect(result).toEqual({ id: '1', name: 'John', email: 'john@example.com' });
    });

    it('should handle mockResolvedValueOnce', async () => {
      const mockFn = createMock<() => Promise<string>>();
      mockFn.mockResolvedValueOnce('first');
      mockFn.mockResolvedValue('default');

      expect(await mockFn()).toBe('first');
      expect(await mockFn()).toBe('default');
    });

    it('should handle mockRejectedValue', async () => {
      const mockFn = createMock<() => Promise<any>>();
      const error = new Error('Network error');
      mockFn.mockRejectedValue(error);

      try {
        await mockFn();
        expect.unreachable();
      } catch (err) {
        expect(err).toBe(error);
      }
    });
  });

  describe('deep mocking', () => {
    it('should create deep mocks for nested objects', () => {
      const mockUserService = createMock<UserService>();

      // Access deeply nested properties
      const user = mockUserService.getUser('123');
      expect(user).toBeDefined();
      expect(isMock(mockUserService.getUser)).toBe(true);
    });

    it('should mock nested service dependencies', () => {
      const mockUserService = createMock<UserService>();

      // Access nested objects
      expect(mockUserService.cache).toBeDefined();
      expect(mockUserService.repository).toBeDefined();

      // Nested objects can be called/used
      expect(typeof mockUserService.cache.get).toBe('function');
      expect(typeof mockUserService.repository.findById).toBe('function');
    });

    it('should handle deeply nested method calls', async () => {
      const mockUserService = createMock<UserService>();

      // Mock at any level of depth
      mockUserService.cache.get.mockReturnValue({
        id: '1',
        name: 'John',
        email: 'john@example.com',
      });

      const cachedUser = mockUserService.cache.get('user:1');
      expect(cachedUser).toEqual({
        id: '1',
        name: 'John',
        email: 'john@example.com',
      });
    });
  });

  describe('type safety', () => {
    it('should support DeepMocked type annotation', () => {
      const mockUserService: DeepMocked<UserService> = createMock<UserService>();

      // TypeScript should recognize all methods
      expect(typeof mockUserService.getUser).toBe('function');
      expect(typeof mockUserService.cache.get).toBe('function');
    });
  });

  describe('createMockWithDefaults', () => {
    it('should create mock with initial values', async () => {
      const mockUserService = createMockWithDefaults<UserService>({
        getUser: async (id: string) => ({
          id,
          name: 'John Doe',
          email: 'john@example.com',
        }),
        getAllUsers: async () => [
          { id: '1', name: 'John', email: 'john@example.com' },
          { id: '2', name: 'Jane', email: 'jane@example.com' },
        ],
      });

      const user = await mockUserService.getUser('1');
      expect(user.name).toBe('John Doe');

      const users = await mockUserService.getAllUsers();
      expect(users).toHaveLength(2);
    });

    it('should allow overriding defaults per test', async () => {
      const mockUserService = createMockWithDefaults<UserService>({
        getUser: async () => ({
          id: 'default',
          name: 'Default User',
          email: 'default@example.com',
        }),
      });

      // Override for specific test
      mockUserService.getUser.mockResolvedValue({
        id: 'custom',
        name: 'Custom User',
        email: 'custom@example.com',
      });

      const user = await mockUserService.getUser('1');
      expect(user.id).toBe('custom');
    });
  });

  describe('mock utilities', () => {
    it('should provide call tracking info', () => {
      const mockFn = createMock<(x: number, y: number) => number>();
      mockFn(1, 2);
      mockFn(3, 4);

      const info = getCallInfo(mockFn);
      expect(info.callCount).toBe(2);
      expect(info.lastCall).toEqual([3, 4]);
    });

    it('should support mockClear', () => {
      const mockFn = createMock<() => void>();
      mockFn();
      mockFn();

      const infoBefore = getCallInfo(mockFn);
      expect(infoBefore.callCount).toBe(2);

      mockFn.mockClear();

      const infoAfter = getCallInfo(mockFn);
      expect(infoAfter.callCount).toBe(0);
    });

    it('should support mockReset', () => {
      const mockFn = createMock<() => string>();
      mockFn.mockReturnValue('custom');
      mockFn();

      mockFn.mockReset();
      mockFn.mockReturnValue('reset');

      expect(mockFn()).toBe('reset');
    });
  });

  describe('real-world scenarios', () => {
    it('should mock a repository with multiple async operations', async () => {
      const mockUserRepository = createMock<UserRepository>();

      mockUserRepository.findById.mockResolvedValue({
        id: '1',
        name: 'John',
        email: 'john@example.com',
      });

      mockUserRepository.findAll.mockResolvedValue([
        { id: '1', name: 'John', email: 'john@example.com' },
        { id: '2', name: 'Jane', email: 'jane@example.com' },
      ]);

      mockUserRepository.count.mockResolvedValue(2);

      // Use the mocks
      const user = await mockUserRepository.findById('1');
      const allUsers = await mockUserRepository.findAll();
      const count = await mockUserRepository.count();

      expect(user.name).toBe('John');
      expect(allUsers).toHaveLength(2);
      expect(count).toBe(2);

      // Verify calls
      const findByIdInfo = getCallInfo(mockUserRepository.findById);
      expect(findByIdInfo.callCount).toBe(1);
      expect(findByIdInfo.calls[0]).toEqual(['1']);
    });

    it('should mock a service with nested dependencies', async () => {
      const mockUserService = createMock<UserService>();

      // Setup repository mock
      mockUserService.repository.findById.mockResolvedValue({
        id: '1',
        name: 'John',
        email: 'john@example.com',
      });

      // Setup cache mock
      mockUserService.cache.get.mockReturnValueOnce(null);
      mockUserService.cache.set.mockReturnValue(undefined);

      // Simulate business logic
      let user = mockUserService.cache.get('user:1');
      if (!user) {
        user = await mockUserService.repository.findById('1');
        mockUserService.cache.set('user:1', user);
      }

      expect(user.name).toBe('John');
      expect(getCallInfo(mockUserService.cache.get).callCount).toBe(1);
      expect(getCallInfo(mockUserService.cache.set).callCount).toBe(1);
    });

    it('should handle method chaining patterns', () => {
      const mockFn = createMock<() => void>();

      // Bun:test mocks support chaining
      mockFn.mockReturnValue(undefined).mockImplementation(() => {});

      expect(mockFn).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle recursive type definitions', () => {
      interface Node {
        value: string;
        next?: Node;
      }

      const mockNode = createMock<Node>();
      expect(mockNode).toBeDefined();
      expect(mockNode.value).toBeDefined();
      expect(mockNode.next).toBeDefined();
    });

    it('should handle Promise return types correctly', async () => {
      const mockAsyncFn = createMock<() => Promise<string>>();
      mockAsyncFn.mockResolvedValue('result');

      const result = await mockAsyncFn();
      expect(result).toBe('result');
    });

    it('should handle generic functions', () => {
      const mockGenericFn = createMock<<T>(value: T) => T>();
      const result = mockGenericFn('test');

      expect(result).toBeDefined();
    });
  });
});