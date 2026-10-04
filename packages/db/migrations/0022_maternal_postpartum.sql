-- The prototype seed stored the postpartum type as 產後一年內; the API's value is 產後 (分娩後未滿一年).
UPDATE maternal_cases SET type = '產後' WHERE type = '產後一年內';
