export interface CaptionLine {
  readonly endTime: number;
  readonly startTime: number;
  readonly text: string;
}

export interface CaptionPosition {
  readonly x: number;
  readonly y: number;
}

export interface ClipCrop {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
}

export interface ClipPreviewCandidate {
  readonly captionLines: readonly CaptionLine[];
  readonly captionPosition: CaptionPosition;
  readonly captionStyle: "hormozi";
  readonly captionsEnabled: true;
  readonly crop: ClipCrop | null;
  readonly endTime: number;
  readonly id: string;
  readonly previewFontSize: number;
  readonly rank: number;
  readonly score: number;
  readonly startTime: number;
  readonly title: string;
}

export interface ProjectClipList {
  readonly clips: readonly ClipPreviewCandidate[];
  readonly projectId: string;
  readonly sourceDurationSeconds: number;
}
