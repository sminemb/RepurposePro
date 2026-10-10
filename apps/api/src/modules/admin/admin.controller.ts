import {
  BadRequestException,
  Controller,
  Get,
  HttpException,
  NotFoundException,
  Param,
  Query,
  Req,
  ServiceUnavailableException,
  UseGuards,
} from "@nestjs/common";
import type { AuthenticatedRequest } from "../auth/auth.guard";
import type { AdminCollection } from "@repurposepro/shared";
import { AdminGuard } from "./admin.guard";
import { parseAdminId, parseAdminList, parseAdminRange, parseAdminSearch } from "./admin.contracts";
import { AdminService } from "./admin.service";

@Controller("admin")
@UseGuards(AdminGuard)
export class AdminController {
  public constructor(private readonly service: AdminService) {}
  private envelope(request: AuthenticatedRequest, code: string, message: string) {
    return { error: { code, message, details: null, requestId: request.id ?? "req_unknown" } };
  }
  private async read<T>(
    request: AuthenticatedRequest,
    parse: () => T,
    execute: (input: T) => Promise<unknown>,
  ) {
    let input: T;
    try {
      input = parse();
    } catch {
      throw new BadRequestException(
        this.envelope(
          request,
          "ADMIN_QUERY_INVALID",
          "Check your lookup, filters or page cursor and try again.",
        ),
      );
    }
    try {
      return await execute(input);
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException(
        this.envelope(
          request,
          "ADMIN_DATA_UNAVAILABLE",
          "Admin data is temporarily unavailable. Try again.",
        ),
      );
    }
  }
  @Get("overview")
  public overview(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.read(
      request,
      () => parseAdminRange(query),
      async (range) => ({ data: await this.service.overview(range) }),
    );
  }
  @Get("search")
  public search(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.read(
      request,
      () => parseAdminSearch(query),
      async (q) => ({ data: await this.service.search(q) }),
    );
  }
  private list(collection: AdminCollection, query: unknown, request: AuthenticatedRequest) {
    return this.read(
      request,
      () => parseAdminList(collection, query),
      (input) => this.service.list(collection, input),
    );
  }
  @Get("users") public users(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.list("users", query, request);
  }
  @Get("projects") public projects(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.list("projects", query, request);
  }
  @Get("jobs") public jobs(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.list("jobs", query, request);
  }
  @Get("payments") public payments(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.list("payments", query, request);
  }
  @Get("ledger") public ledger(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    return this.list("ledger", query, request);
  }
  private detail(
    collection: "users" | "projects" | "jobs",
    id: unknown,
    request: AuthenticatedRequest,
  ) {
    return this.read(
      request,
      () => parseAdminId(id),
      async (key) => {
        const data =
          collection === "users"
            ? await this.service.userDetail(key)
            : await this.service.detail(collection, key);
        if (!data)
          throw new NotFoundException(
            this.envelope(request, "ADMIN_RECORD_NOT_FOUND", "This record could not be found."),
          );
        return { data };
      },
    );
  }
  @Get("users/:userId") public user(
    @Param("userId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.detail("users", id, request);
  }
  @Get("projects/:projectId") public project(
    @Param("projectId") id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.detail("projects", id, request);
  }
  @Get("jobs/:jobId") public job(@Param("jobId") id: string, @Req() request: AuthenticatedRequest) {
    return this.detail("jobs", id, request);
  }
}
