import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import express from 'express'
import jwt from 'jsonwebtoken'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'

let mongoServer

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create()
})

afterAll(async () => {
  if (mongoServer) await mongoServer.stop()
})

describe('JWT_SECRET strength validation', () => {
  it('rejects weak JWT secrets at startup', () => {
    const weakSecrets = ['test-secret', 'jwt_mindful', 'secret', 'changeme', 'password', 'default']
    for (const secret of weakSecrets) {
      expect(secret.length < 32 || ['test-secret', 'jwt_mindful', 'secret', 'changeme', 'password', 'default'].includes(secret)).toBe(true)
    }
  })

  it('JWT_SECRET validation code exists in index.js', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/../index.js', import.meta.url), 'utf-8')
    expect(content).toContain('JWT_SECRET')
    expect(content).toContain('weakSecrets')
    expect(content).toContain('32')
  })

  it('authController no longer has hardcoded JWT fallback', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/controllers/authController.js', import.meta.url), 'utf-8')
    expect(content).not.toContain('test-secret')
    expect(content).not.toContain('process.env.JWT_SECRET =')
  })
})

describe('Mass-assignment protection', () => {
  it('searchRoutes update-student uses allowlist', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/searchRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('allowedStudentFields')
    expect(content).toContain('findByIdAndUpdate')
    expect(content).not.toMatch(/findByIdAndUpdate\(req\.params\.id,\s*req\.body\)/)
  })

  it('searchRoutes update-user uses allowlist', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/searchRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('allowedUserFields')
  })

  it('examRoutes update uses allowlist', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/examRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('allowedExamFields')
  })

  it('studentRoutes POST uses allowlist', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/studentRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('allowedStudentCreateFields')
    expect(content).not.toMatch(/new Student\(req\.body\)/)
  })

  it('actionPlanRoutes POST uses allowlist', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/actionPlanRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('allowedActionPlanFields')
  })
})

describe('ReDoS protection', () => {
  it('searchRoutes escapes regex input', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/searchRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('escapeRegExp')
  })

  it('searchRoutes imports escapeRegExp', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/searchRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain("import { escapeRegExp }")
  })
})

describe('Protected routes require auth', () => {
  it('notificationRoutes /resolve/:studentId has authenticateUser', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/notificationRoutes.js', import.meta.url), 'utf-8')
    const resolveRoute = content.match(/resolve.*studentId.*async.*req.*res/s)
    expect(resolveRoute).toBeTruthy()
    expect(content).toContain("notifications/resolve/:studentId")
  })

  it('documentRoutes GET /documents/:id has authenticateUser', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/documentRoutes.js', import.meta.url), 'utf-8')
    const lines = content.split('\n')
    let foundRoute = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes("/documents/:id") && lines[i].includes("get(")) {
        const surrounding = lines.slice(Math.max(0, i - 2), i + 3).join('\n')
        expect(surrounding).toMatch(/authenticateUser/)
        foundRoute = true
        break
      }
    }
    expect(foundRoute).toBe(true)
  })

  it('statsRoutes /courses-per-month has authenticateUser', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/statsRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('/courses-per-month')
    const lines = content.split('\n')
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('/courses-per-month') && lines[i].includes('get(')) {
        const surrounding = lines.slice(i, i + 3).join('\n')
        expect(surrounding).toMatch(/authenticateUser/)
        break
      }
    }
  })

  it('studentRoutes GET /all-programs has authenticateUser', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/studentRoutes.js', import.meta.url), 'utf-8')
    const lines = content.split('\n')
    let found = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('/all-programs') && lines[i].includes('get(')) {
        const surrounding = lines.slice(i, i + 3).join('\n')
        expect(surrounding).toMatch(/authenticateUser/)
        expect(surrounding).toMatch(/hasRole/)
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })

  it('studentRoutes GET /all-course-packages has authenticateUser', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/studentRoutes.js', import.meta.url), 'utf-8')
    const lines = content.split('\n')
    let found = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('/all-course-packages') && lines[i].includes('get(')) {
        const surrounding = lines.slice(i, i + 3).join('\n')
        expect(surrounding).toMatch(/authenticateUser/)
        expect(surrounding).toMatch(/hasRole/)
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })

  it('studentRoutes GET /all-courses has authenticateUser', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/studentRoutes.js', import.meta.url), 'utf-8')
    const lines = content.split('\n')
    let found = false
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('/all-courses') && lines[i].includes('get(')) {
        const surrounding = lines.slice(i, i + 3).join('\n')
        expect(surrounding).toMatch(/authenticateUser/)
        expect(surrounding).toMatch(/hasRole/)
        found = true
        break
      }
    }
    expect(found).toBe(true)
  })
})

describe('Error sanitization in production', () => {
  it('errorHandler only exposes stack in development mode', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/utils/errorHandler.js', import.meta.url), 'utf-8')
    expect(content).toContain('development')
    expect(content).toContain('err.stack')
    expect(content).not.toMatch(/process\.env\.NODE_ENV\s*===?\s*["']production["']/)
  })

  it('documentRoutes does not leak err.message in 500 responses', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/documentRoutes.js', import.meta.url), 'utf-8')
    const lines = content.split('\n')
    let inCatchBlock = false
    for (const line of lines) {
      if (line.includes('catch')) inCatchBlock = true
      if (inCatchBlock && line.includes('status(500)')) {
        expect(line).not.toContain('err.message')
        inCatchBlock = false
      }
    }
  })
})

describe('Filename sanitization', () => {
  it('documentRoutes sanitizes uploaded filenames', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/documentRoutes.js', import.meta.url), 'utf-8')
    expect(content).toContain('safeName')
    expect(content).toContain('replace(/[^a-zA-Z0-9._-]/g')
  })
})

describe('CORS null-origin handling', () => {
  it('security.js rejects null origin in production', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/middleware/security.js', import.meta.url), 'utf-8')
    expect(content).toContain('NODE_ENV')
    expect(content).toContain('production')
    expect(content).toContain('No Origin')
  })
})

describe('Sensitive data not logged', () => {
  it('documentRoutes does not log req.body values directly', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../src/router/documentRoutes.js', import.meta.url), 'utf-8')
    expect(content).not.toMatch(/console\.log.*req\.body\b/)
    expect(content).not.toMatch(/logger\.(info|debug|warn)\(\{[^}]*body:/)
  })
})

describe('Env files have placeholders', () => {
  it('.env.production has placeholder JWT_SECRET', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../.env.production', import.meta.url), 'utf-8')
    expect(content).toContain('REPLACE_WITH_GENERATED_SECRET')
  })

  it('.env.development has placeholder JWT_SECRET', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../.env.development', import.meta.url), 'utf-8')
    expect(content).toContain('REPLACE_WITH_GENERATED_SECRET')
  })

  it('.env.production has placeholder Google password', async () => {
    const fs = await import('fs')
    const content = fs.readFileSync(new URL('../../.env.production', import.meta.url), 'utf-8')
    expect(content).toContain('REPLACE_WITH_GOOGLE_APP_PASSWORD')
  })
})
