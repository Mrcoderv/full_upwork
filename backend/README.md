# Mindful Learning Backend

A comprehensive Node.js/Express backend for the Mindful Learning platform with enhanced security, performance, and monitoring features.

## 🚀 Features

### 🔒 Security

-   **Enhanced Role-Based Access Control (RBAC)**
-   **Rate Limiting** - Prevents abuse and DDoS attacks
-   **Security Headers** - Helmet.js for protection against common vulnerabilities
-   **Input Validation & Sanitization** - Prevents XSS and injection attacks
-   **CORS Protection** - Configurable cross-origin resource sharing
-   **JWT Authentication** - Secure token-based authentication
-   **Centralized Cookie Management** - Single source of truth for auth cookie config (`src/config/cookies.js`)
-   **Security Audit Logging** - Tracks suspicious activities

### ⚡ Performance

-   **Lazy Loading** - Efficient data loading for large datasets
-   **Caching System** - In-memory caching with TTL
-   **Database Optimization** - Connection pooling and query optimization
-   **Request Optimization** - Pagination, sorting, and field selection
-   **Performance Monitoring** - Real-time performance metrics

### 📊 Monitoring & Error Handling

-   **Structured Logging** - Winston logger with file rotation
-   **Error Tracking** - Comprehensive error monitoring and reporting
-   **Performance Metrics** - Request timing and slow query detection
-   **Health Checks** - System health monitoring endpoints
-   **Graceful Shutdown** - Proper cleanup on application termination

### 🧪 Testing

-   **Unit Tests** - Comprehensive unit test coverage
-   **Integration Tests** - API endpoint testing with in-memory database
-   **Test Coverage** - Code coverage reporting
-   **Mock Support** - Isolated testing with mocked dependencies

## 📋 Prerequisites

-   Node.js 18+
-   MongoDB 5+
-   npm or yarn

## 🛠️ Installation

1. **Clone the repository**

    ```bash
    git clone <repository-url>
    cd mindful-new/backend
    ```

2. **Install dependencies**

    ```bash
    npm install
    ```

3. **Environment Setup**

    ```bash
    # Copy the example environment file
    cp env.example .env.development

    # Edit the environment file with your configuration
    nano .env.development
    ```

4. **Create logs directory**
    ```bash
    mkdir logs
    ```

## ⚙️ Configuration

### Environment Variables

Create `.env.development` for development or `.env.production` for production:

```env
# Application Configuration
NODE_ENV=development
PORT=5001

# Database Configuration
MONGODB_URI=mongodb://localhost:27017/mindfullearning

# Security Configuration
JWT_SECRET=your-super-secret-jwt-key-here
JWT_EXPIRES_IN=7d

# Client Configuration
CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Performance Configuration
CACHE_TTL=3600
MAX_CONCURRENT_REQUESTS=50
REQUEST_TIMEOUT=30000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
LOG_FILE=./logs/app.log

# File Upload
MAX_FILE_SIZE=10485760
UPLOAD_PATH=./public/uploads
```

## 🚀 Running the Application

### Development Mode

```bash
npm run dev
```

### Production Mode

```bash
npm start
```

### Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests only
npm run test:integration

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:fix

# Security audit
npm run security:audit

# Fix security issues
npm run security:fix
```

## 📊 Monitoring Endpoints

### Health Check

```bash
GET /health
```

Returns system health status including database connection, uptime, and performance metrics.

### Metrics

```bash
GET /metrics
```

Returns detailed system metrics including error rates, cache statistics, and database performance.

## 🔒 Security Features

### Role Hierarchy

The system implements a hierarchical role-based access control:

1. **guest** (0) - No access
2. **user** (1) - Basic access
3. **student** (2) - Student access
4. **coordinator** (3) - Coordinator access
5. **specped** (4) - Special education access
6. **syv** (5) - Study and career guidance access
7. **teacher** (6) - Teacher access
8. **admin** (7) - Administrator access
9. **systemadmin** (8) - System administrator access

### Permission Matrix

Each role has specific permissions for different resources:

-   **Students**: Can read/write own profile, read own courses and grades
-   **Teachers**: Can read assigned students/courses, write grades and comments
-   **Admins**: Can read/write/delete all students, teachers, courses, and grades
-   **System Admins**: Have full access to all resources

### Rate Limiting

-   **General API**: 100 requests per 15 minutes per IP
-   **Authentication**: 5 login attempts per 15 minutes per IP
-   **File Uploads**: 10 uploads per hour per IP
-   **API Endpoints**: 60 requests per minute per IP

## ⚡ Performance Features

### Caching

-   **In-memory cache** with configurable TTL
-   **Automatic cleanup** of expired entries
-   **Cache statistics** for monitoring

### Database Optimization

-   **Connection pooling** with configurable pool size
-   **Query optimization** with pagination and field selection
-   **Database indexes** for improved query performance
-   **Lazy loading** for related data

### Request Optimization

-   **Pagination** support for large datasets
-   **Field selection** to reduce data transfer
-   **Population control** for related data loading
-   **Request compression** and caching headers

## 🧪 Testing Strategy

### Unit Tests

-   **Authentication** - Login, logout, token validation, cookie management
-   **Input Validation** - Email, password, ObjectId validation
-   **Role-Based Access Control** - Permission checking and role hierarchy
-   **Error Handling** - Custom error classes and error monitoring

### Integration Tests

-   **API Endpoints** - Full request/response testing
-   **Database Operations** - CRUD operations with in-memory database
-   **Authentication Flow** - Complete login/logout cycle
-   **Error Scenarios** - 404, 400, 401, 403 responses

### Test Coverage

-   **Minimum 80%** code coverage requirement
-   **864 tests** across 53 test files
-   **Critical paths** must have 100% coverage
-   **Security features** require comprehensive testing

## 📁 Project Structure

```
backend/
├── src/
│   ├── config/              # Centralized configuration
│   │   ├── cookies.js       # Auth cookie name, options, and helpers
│   │   ├── permissions.js   # Permission definitions
│   │   └── roles.js         # Role hierarchy
│   ├── controllers/          # Request handlers
│   ├── middleware/           # Custom middleware
│   │   ├── auth.js          # Authentication middleware
│   │   └── security.js      # Security middleware
│   ├── models/              # Database models
│   ├── router/              # Route definitions
│   └── utils/               # Utility functions
│       ├── errorHandler.js  # Error handling and logging
│       └── performance.js   # Performance optimization
├── tests/
│   ├── unit/                # Unit tests
│   └── integration/         # Integration tests
├── logs/                    # Application logs
├── public/                  # Static files
└── scripts/                 # Database scripts
```

## 🔧 Development

### Adding New Features

1. Create feature branch from `main`
2. Implement feature with tests
3. Ensure code coverage meets requirements
4. Run linting and security audit
5. Submit pull request

### Code Style

-   Use ES6+ features
-   Follow ESLint configuration
-   Write meaningful commit messages
-   Include JSDoc comments for public APIs

### Database Changes

-   Create migration scripts in `scripts/`
-   Update models with proper validation
-   Add database indexes for performance
-   Test with sample data

## 🚨 Troubleshooting

### Common Issues

**MongoDB Connection Failed**

```bash
# Check if MongoDB is running
sudo systemctl status mongod

# Check connection string in .env file
# Ensure MongoDB is accessible from your IP
```

**Rate Limiting Issues**

```bash
# Check rate limit configuration in .env
# Monitor /metrics endpoint for rate limit statistics
# Consider increasing limits for development
```

**Performance Issues**

```bash
# Check /metrics endpoint for performance data
# Monitor database connection pool
# Review slow query logs
# Check cache hit rates
```

**Memory Issues**

```bash
# Monitor memory usage in /health endpoint
# Check for memory leaks in long-running processes
# Review cache size and cleanup frequency
```

## 📈 Production Deployment

### Environment Setup

1. Set `NODE_ENV=production`
2. Use strong JWT secrets
3. Configure production database
4. Set up proper logging
5. Configure monitoring

### Security Checklist

-   [ ] Strong JWT secret configured
-   [ ] Rate limiting enabled
-   [ ] CORS properly configured
-   [ ] Security headers enabled
-   [ ] Input validation active
-   [ ] Error logging configured
-   [ ] Database indexes created

### Performance Checklist

-   [ ] Database connection pooling configured
-   [ ] Caching enabled
-   [ ] Compression enabled
-   [ ] Static file serving configured
-   [ ] Monitoring endpoints accessible
-   [ ] Health checks implemented

## 📞 Support

For issues and questions:

1. Check the troubleshooting section
2. Review the logs in `logs/` directory
3. Check the monitoring endpoints
4. Create an issue in the repository

## 📄 License

This project is licensed under the ISC License.
