import { randomUUID } from "node:crypto";
import { access, mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

export interface LocalStorageConfig {
  readonly storageRoot: string;
}

export interface CommitSourceUploadInput {
  readonly fileSizeBytes: number;
  readonly mimeType: string;
  readonly originalFileName: string;
  readonly projectId: string;
  readonly stagedPath: string;
  readonly userId: string;
}

export interface SourcePaths {
  readonly directory: string;
  readonly manifest: string;
  readonly video: string;
}

export interface SourceManifest {
  readonly fileSizeBytes: number;
  readonly mimeType: string;
  readonly originalFileName: string;
  readonly storedAt: string;
  readonly version: 1;
}

export interface StoredSourceUpload {
  readonly manifest: SourceManifest;
  readonly videoPath: string;
}

export class LocalStorageService {
  public readonly storageRoot: string;
  private readonly stagingRoot: string;

  public constructor(config: LocalStorageConfig) {
    this.storageRoot = resolve(config.storageRoot);
    this.stagingRoot = join(this.storageRoot, ".staging");
  }

  public stagingPath(fileName: string): string {
    if (!/^[a-zA-Z0-9-]+$/.test(fileName)) {
      throw new Error("Upload staging filename is invalid.");
    }

    return this.assertWithinRoot(join(this.stagingRoot, fileName));
  }

  public sourcePaths(userId: string, projectId: string): SourcePaths {
    const directory = this.assertWithinRoot(
      join(
        this.storageRoot,
        "users",
        this.storagePathSegment(userId),
        "projects",
        this.storagePathSegment(projectId),
        "source",
      ),
    );

    return {
      directory,
      manifest: join(directory, "manifest.json"),
      video: join(directory, "video"),
    };
  }

  public async commitSourceUpload(input: CommitSourceUploadInput): Promise<void> {
    const stagedPath = this.assertStagedPath(input.stagedPath);
    await stat(stagedPath);

    const sourcePaths = this.sourcePaths(input.userId, input.projectId);
    const replacementDirectory = this.assertWithinRoot(
      join(this.stagingRoot, `commit-${randomUUID()}`),
    );
    const backupDirectory = this.assertWithinRoot(
      join(dirname(sourcePaths.directory), `.source-backup-${randomUUID()}`),
    );
    let backupCreated = false;

    await mkdir(replacementDirectory, { recursive: true });

    try {
      await rename(stagedPath, join(replacementDirectory, "video"));
      await writeFile(
        join(replacementDirectory, "manifest.json"),
        JSON.stringify(this.createManifest(input)),
        "utf8",
      );
      await mkdir(dirname(sourcePaths.directory), { recursive: true });

      if (await this.pathExists(sourcePaths.directory)) {
        await rename(sourcePaths.directory, backupDirectory);
        backupCreated = true;
      }

      try {
        await rename(replacementDirectory, sourcePaths.directory);
      } catch (error) {
        if (backupCreated && (await this.pathExists(backupDirectory))) {
          await rename(backupDirectory, sourcePaths.directory);
          backupCreated = false;
        }

        throw error;
      }
    } finally {
      await rm(replacementDirectory, { force: true, recursive: true });
      if (backupCreated) {
        await rm(backupDirectory, { force: true, recursive: true });
      }
    }
  }

  public async discardStagedUpload(stagedPath: string): Promise<void> {
    await rm(this.assertStagedPath(stagedPath), { force: true });
  }

  public async readSourceUpload(userId: string, projectId: string): Promise<StoredSourceUpload> {
    const sourcePaths = this.sourcePaths(userId, projectId);
    const contents = await readFile(sourcePaths.manifest, "utf8");
    const manifest = this.parseManifest(contents);
    await stat(sourcePaths.video);

    return { manifest, videoPath: sourcePaths.video };
  }

  public async removeSourceUpload(userId: string, projectId: string): Promise<void> {
    const sourcePaths = this.sourcePaths(userId, projectId);
    await rm(sourcePaths.directory, { force: true, recursive: true });
  }

  private assertStagedPath(stagedPath: string): string {
    const resolvedPath = this.assertWithinRoot(stagedPath);
    const stagingRelativePath = relative(this.stagingRoot, resolvedPath);

    if (
      stagingRelativePath.length === 0 ||
      stagingRelativePath === ".." ||
      stagingRelativePath.startsWith(`..${sep}`) ||
      isAbsolute(stagingRelativePath)
    ) {
      throw new Error("Upload file must be inside the private staging directory.");
    }

    return resolvedPath;
  }

  private assertWithinRoot(path: string): string {
    const resolvedPath = resolve(path);
    const rootRelativePath = relative(this.storageRoot, resolvedPath);

    if (
      rootRelativePath === ".." ||
      rootRelativePath.startsWith(`..${sep}`) ||
      isAbsolute(rootRelativePath)
    ) {
      throw new Error("Storage path must remain inside the configured storage root.");
    }

    return resolvedPath;
  }

  private createManifest(input: CommitSourceUploadInput): SourceManifest {
    const originalFileName = basename(input.originalFileName.replaceAll("\\", "/")).slice(0, 255);

    return {
      fileSizeBytes: input.fileSizeBytes,
      mimeType: input.mimeType,
      originalFileName,
      storedAt: new Date().toISOString(),
      version: 1,
    };
  }

  private parseManifest(contents: string): SourceManifest {
    try {
      const parsed: unknown = JSON.parse(contents);
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("fileSizeBytes" in parsed) ||
        !("mimeType" in parsed) ||
        !("originalFileName" in parsed) ||
        !("storedAt" in parsed) ||
        !("version" in parsed)
      ) {
        throw new Error("Invalid manifest.");
      }

      const manifest = parsed as SourceManifest;
      if (
        !Number.isSafeInteger(manifest.fileSizeBytes) ||
        manifest.fileSizeBytes <= 0 ||
        typeof manifest.mimeType !== "string" ||
        manifest.mimeType.length === 0 ||
        typeof manifest.originalFileName !== "string" ||
        manifest.originalFileName.length === 0 ||
        typeof manifest.storedAt !== "string" ||
        Number.isNaN(Date.parse(manifest.storedAt)) ||
        manifest.version !== 1
      ) {
        throw new Error("Invalid manifest.");
      }

      return manifest;
    } catch {
      throw new Error("Stored source metadata is invalid.");
    }
  }

  private storagePathSegment(value: string): string {
    const encodedValue = encodeURIComponent(value).replaceAll(".", "%2E");

    if (encodedValue.length === 0) {
      throw new Error("Storage path segment is invalid.");
    }

    return encodedValue;
  }

  private async pathExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  }
}
