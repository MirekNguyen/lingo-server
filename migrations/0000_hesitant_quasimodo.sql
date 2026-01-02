CREATE TABLE "sentences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"word_id" uuid NOT NULL,
	"vietnamese" text NOT NULL,
	"english" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "words" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"english" text NOT NULL,
	"vietnamese" text NOT NULL,
	"frequency_rank" integer DEFAULT 9999,
	"is_new" boolean DEFAULT true NOT NULL,
	"repetition" integer DEFAULT 0 NOT NULL,
	"interval" integer DEFAULT 0 NOT NULL,
	"ease_factor" real DEFAULT 2.5 NOT NULL,
	"due_date" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sentences" ADD CONSTRAINT "sentences_word_id_words_id_fk" FOREIGN KEY ("word_id") REFERENCES "public"."words"("id") ON DELETE no action ON UPDATE no action;