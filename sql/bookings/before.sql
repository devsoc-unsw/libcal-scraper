-- The '{0}' are for substitution of the current time from the code
-- The zero is there in case we need future substitutions, possibly
-- using some kind of format function

-- Remove all bookings after the current time
DELETE FROM Bookings
WHERE "bookingType" = 'LIB' AND "start" > '{0}';

-- Truncate all bookings that go past the current time
UPDATE Bookings
SET "end" = '{0}'
WHERE "bookingType" = 'LIB' AND "end" > '{0}';
