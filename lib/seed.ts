export interface TestAccount {
  email: string;
  user: string;
  role: string;
  name: string;
}

export const TEST_ACCOUNTS: TestAccount[] = [
  { email: 'admin@test.com', user: 'admin', role: 'admin', name: 'Regal Admin' },
  { email: 'ossa@test.com', user: 'ossa', role: 'ossa', name: 'Dr. Evelyn Santos (OSSA Director)' },
  { email: 'ssg@test.com', user: 'ssg', role: 'ssg', name: 'Officer Juan' },
  { email: 'mayor@test.com', user: 'mayor', role: 'mayor', name: 'Maria Clara' },
  { email: 'student@test.com', user: 'student', role: 'student', name: 'Pedro Penduko' },
];
