-- Signing sessions (other people's values) and finalize read field_values by document; the cascade
-- from documents deletes by it too.
create index field_values_document_idx on public.field_values (document_id, recipient_id);
