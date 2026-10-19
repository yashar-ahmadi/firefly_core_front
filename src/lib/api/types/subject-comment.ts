// The comments of a blog post and of a content page (blog digest §1.7, content digest §4): one
// shape for both, read from `<subject>/comment/list/` and sent to `<subject>/comment/submit/`.

/** The two streams of one comment model: «دیدگاه‌ها» and «پرسش و پاسخ». */
export type SubjectCommentType = 'comment' | 'question'

/** One visible entry of a comment list, with its whole visible subtree. */
export interface SubjectComment {
  /** Sent as `parent` to reply. */
  id: number
  name: string
  /** Plain text: escaped, `white-space: pre-wrap`. */
  review: string
  /** A reply's is its parent's. */
  comment_type: SubjectCommentType
  /** The shop's answer, written in the panel: «پاسخ فروشگاه». */
  is_user_admin: boolean
  /** The viewer wrote it (a session's read only): «شما». */
  is_current_user: boolean
  parent_id: number | null
  /** Newest first, any depth. */
  replies: SubjectComment[]
  created: string
}

/** A comment's submission: 201 with only `msg` (moderated; nothing returned). */
export interface SubjectCommentSubmitBody {
  /** Required, ≤ 4096. */
  review: string
  /** Required for guests (≤ 255); ignored for a signed-in visitor. */
  name?: string
  /** Guests only; a valid address when sent (never "": the API refuses a blank one). */
  email?: string
  /** Default 'comment'; a reply's is its parent's. */
  comment_type?: SubjectCommentType
  /** An accepted comment of the same subject. */
  parent?: number
  /** Honeypot: hidden, empty. */
  website?: string
}
