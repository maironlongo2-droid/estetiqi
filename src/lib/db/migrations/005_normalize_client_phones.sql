UPDATE clients
SET phone = '+55' || phone
WHERE phone IS NOT NULL
  AND phone ~ '^[0-9]{10,11}$'
  AND phone NOT LIKE '+%';