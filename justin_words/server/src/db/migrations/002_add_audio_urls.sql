-- Add audio URLs to word_metadata table
ALTER TABLE word_metadata ADD COLUMN en_definition_audio_url TEXT;
ALTER TABLE word_metadata ADD COLUMN en_example_audio_url TEXT;
ALTER TABLE word_metadata ADD COLUMN zh_definition_audio_url TEXT;
ALTER TABLE word_metadata ADD COLUMN zh_example_audio_url TEXT;