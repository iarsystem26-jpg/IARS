export const passwordRequirements = (password: string) => [
  { label: 'At least 12 characters', met: password.length >= 12 },
  { label: 'Contains uppercase letter', met: /[A-Z]/.test(password) },
  { label: 'Contains number', met: /[0-9]/.test(password) },
  { label: 'Contains special character', met: /[^A-Za-z0-9]/.test(password) },
];

export const isValidPassword = (password: string) => password.length <= 1024 && passwordRequirements(password).every(rule => rule.met);

export function generatePassword(): string {
  const groups = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%&*?'];
  const randomIndex = (length: number) => {
    const bytes = new Uint32Array(1);
    const limit = Math.floor(0x100000000 / length) * length;
    do { crypto.getRandomValues(bytes); } while (bytes[0] >= limit);
    return bytes[0] % length;
  };
  const characters = groups.map(group => group[randomIndex(group.length)]);
  const alphabet = groups.join('');
  while (characters.length < 16) characters.push(alphabet[randomIndex(alphabet.length)]);
  for (let i = characters.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [characters[i], characters[j]] = [characters[j], characters[i]];
  }
  return characters.join('');
}
