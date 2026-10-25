<?php
// Bluehost stopgap for visitors whose DNS still points here: the old cached page posts to this
// file, and a 307 forwards the POST, body and all, to the Worker that now handles the form.
header('Location: https://tearex-contact.tearexwoodworks.workers.dev/submit', true, 307);
exit;
