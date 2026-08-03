export const ERROR_MESSAGES = {
  AUTH_INVALID_CREDENTIALS: 'E-postadress eller lösenord är felaktigt.',
  AUTH_USER_EXISTS: 'En användare med denna e-postadress finns redan.',
  AUTH_TOKEN_EXPIRED: 'Länken har gått ut. Begär en ny återställning.',
  AUTH_WEAK_PASSWORD: 'Lösenordet uppfyller inte säkerhetskraven.',
  STUDENT_NOT_FOUND: 'Eleven hittades inte.',
  COURSE_NOT_FOUND: 'Kursen hittades inte.',
  ENROLLMENT_DUPLICATE: 'Eleven är redan anmäld till denna kurs.',
  UPLOAD_FILE_TOO_LARGE: 'Filen är för stor. Maxstorlek är 10 MB.',
  UPLOAD_INVALID_TYPE: 'Filtypen är inte tillåten.',
}

export function getUserMessage(code, fallback = 'Ett fel uppstod. Försök igen.') {
  return ERROR_MESSAGES[code] || fallback
}
