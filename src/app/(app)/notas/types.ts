export type HomeNote = {
  id: string;
  title: string;
  body: string;
  tag: string;
  pinned: boolean;
  is_secret: boolean;
  photo_path: string | null;
  updated_at: string;
};
