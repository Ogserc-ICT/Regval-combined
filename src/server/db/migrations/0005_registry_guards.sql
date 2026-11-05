-- Registry records are never deleted and their numbers never change once
-- issued ([G12]; SPEC §3, §17, §21, §22). An FD item is registered once only.

CREATE TRIGGER front_desk_items_no_delete BEFORE DELETE ON front_desk_items FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER outward_items_no_delete BEFORE DELETE ON outward_items FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER files_no_delete BEFORE DELETE ON files FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER file_movements_no_delete BEFORE DELETE ON file_movements FOR EACH ROW EXECUTE FUNCTION reject_delete();
--> statement-breakpoint
CREATE TRIGGER front_desk_items_numbers_locked BEFORE UPDATE ON front_desk_items
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('fd_no', 'fd_year', 'received_at', 'inward_item_id');
--> statement-breakpoint
CREATE TRIGGER outward_items_numbers_locked BEFORE UPDATE ON outward_items
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('out_no', 'out_year');
--> statement-breakpoint
CREATE TRIGGER files_numbers_locked BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('file_ref');
--> statement-breakpoint
CREATE TRIGGER file_movements_locked BEFORE UPDATE ON file_movements
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('file_id', 'out_at', 'issued_to', 'unit_id', 'returned_at');
--> statement-breakpoint
CREATE TRIGGER inward_items_links_locked BEFORE UPDATE ON inward_items
  FOR EACH ROW EXECUTE FUNCTION numbers_locked('front_desk_item_id');
