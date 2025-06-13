/**
 * Central definition of test users for development
 * This file is used by both the seeding process and the QuickLogin component
 */

// Get the configurable test city ID from environment variable
export const DEV_TEST_CITY_ID = process.env.DEV_TEST_CITY_ID || 'chania'

// Define test user emails in one place
const TEST_USER_EMAILS = {
  SUPER_ADMIN: 'dev-superadmin@test.com',
  CITY_ADMIN: 'dev-city@test.com',
  PARTY_ADMIN: 'dev-party@test.com', 
  PERSON_ADMIN: 'dev-person@test.com',
  READ_ONLY: 'dev-readonly@test.com'
} as const

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
    description: `Admin of ${DEV_TEST_CITY_ID} city`
  },
  {
    email: TEST_USER_EMAILS.PARTY_ADMIN,
    name: 'Party Admin', // Will be updated with actual party name during seeding
    isSuperAdmin: false,
    adminType: 'party' as const,
    description: `Admin of specific party in ${DEV_TEST_CITY_ID}`
  },
  {
    email: TEST_USER_EMAILS.PERSON_ADMIN,
    name: 'Person Admin', // Will be updated with actual person name during seeding
    isSuperAdmin: false,
    adminType: 'person' as const,
    description: `Admin of specific person in ${DEV_TEST_CITY_ID}`
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