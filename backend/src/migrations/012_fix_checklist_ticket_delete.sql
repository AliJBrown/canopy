-- A ticket-type checklist item requires a ticket_id (see the CHECK constraint below). The FK was
-- ON DELETE SET NULL, so deleting the underlying ticket (e.g. via its project being deleted)
-- nulled out ticket_id while item_type stayed 'ticket', violating that CHECK and blocking the
-- whole delete. If the ticket is gone, the checklist item referencing it should go too.
ALTER TABLE program_checklist_items DROP CONSTRAINT IF EXISTS program_checklist_items_ticket_id_fkey;
ALTER TABLE program_checklist_items ADD CONSTRAINT program_checklist_items_ticket_id_fkey
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE;
