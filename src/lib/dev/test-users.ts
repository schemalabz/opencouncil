/**
 * Central definition of test users for development
 * This file is used by both the seeding process and the QuickLogin component
 */


// Define test user emails in one place
// These are fake emails - set DEV_EMAIL_OVERRIDE to receive login links at a real address
const TEST_USER_EMAILS = {
  SUPER_ADMIN: 'superadmin@test.com',
  CITY_ADMIN: 'city@test.com',
  PARTY_ADMIN: 'party@test.com',
  PERSON_ADMIN: 'person@test.com',
  READ_ONLY: 'readonly@test.com'
} as const

// Check if an email is a test user email
export function isTestUserEmail(email: string): boolean {
  return Object.values(TEST_USER_EMAILS).includes(email as typeof TEST_USER_EMAILS[keyof typeof TEST_USER_EMAILS])
}

// Test user definitions for seeding and QuickLogin
export const TEST_USERS = [
  {
    email: TEST_USER_EMAILS.SUPER_ADMIN,
    name: 'Development Super Admin',
    isSuperAdmin: true,
    adminType: 'superadmin' as const,
    description: 'Full access to everything'
  },
  {
    email: TEST_USER_EMAILS.CITY_ADMIN,
    name: 'City Admin', // Will be updated with actual city name during seeding/creation
    isSuperAdmin: false,
    adminType: 'city' as const,
    description: `Admin of city`
  },
  {
    email: TEST_USER_EMAILS.PARTY_ADMIN,
    name: 'Party Admin', // Will be updated with actual party name during seeding
    isSuperAdmin: false,
    adminType: 'party' as const,
    description: `Admin of specific party in city`
  },
  {
    email: TEST_USER_EMAILS.PERSON_ADMIN,
    name: 'Person Admin', // Will be updated with actual person name during seeding
    isSuperAdmin: false,
    adminType: 'person' as const,
    description: `Admin of specific person in city`
  },
  {
    email: TEST_USER_EMAILS.READ_ONLY,
    name: 'Read Only User',
    isSuperAdmin: false,
    adminType: 'readonly' as const,
    description: 'No admin rights'
  }
] as const

// Helper type for test user admin types
export type TestUserAdminType = typeof TEST_USERS[number]['adminType']

// Helper function to get test user by email
export function getTestUserByEmail(email: string) {
  return TEST_USERS.find(user => user.email === email)
}

// Helper function to get test users for QuickLogin display
export function getTestUsersForDisplay() {
  return TEST_USERS.map(user => ({
    label: getTestUserIcon(user.adminType) + ' ' + user.name,
    email: user.email,
    description: user.description
  }))
}

// Helper function to get icon for test user type
function getTestUserIcon(adminType: TestUserAdminType): string {
  switch (adminType) {
    case 'superadmin': return '🔧'
    case 'city': return '🏛️'
    case 'party': return '🎭'
    case 'person': return '👤'
    case 'readonly': return '👁️'
    default: return '❓'
  }
} 