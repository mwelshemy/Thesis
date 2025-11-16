export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user' | 'moderator';
  createdAt: Date;
  updatedAt: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  status?: number;
  timestamp: number;
  cached?: boolean;
}

export interface RequestConfig {
  method?: string;
  headers?: Record<string, string>;
  data?: any;
  retries?: number;
  retryDelay?: number;
  url?: string;
}

export interface CacheConfig {
  enabled: boolean;
  maxAge?: number;
}

export interface ModalConfig {
  closeOnEsc: boolean;
  closeOnOverlayClick: boolean;
  showCloseButton: boolean;
  maxWidth: string;
  minHeight: string;
}
