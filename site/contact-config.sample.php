<?php
// Copy this file to contact-config.php (same folder) and fill it in.
// contact-config.php is gitignored so the address never lands in the repo.

// Where quote requests go. His inbox.
const CONTACT_TO = 'someone@example.com';

// Must be an address at the site's own domain or Bluehost will spam-flag it.
// It doesn't need to be a real mailbox; replies go to the customer's address via Reply-To.
const CONTACT_FROM = 'noreply@tearexwoodworks.com';

const CONTACT_SUBJECT = 'Quote request';

// Optional but recommended: send through Gmail instead of the host's mail server.
// Needs 2-Step Verification on the Google account and an App Password (16 chars, no spaces).
// Leave SMTP_PASS empty to fall back to PHP mail().
const SMTP_HOST = 'smtp.gmail.com';
const SMTP_PORT = 587;
const SMTP_USER = 'someone@gmail.com';
const SMTP_PASS = '';
