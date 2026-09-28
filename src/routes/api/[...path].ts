import type { APIEvent } from "@solidjs/start/server";
import { db } from "../../server/db";
import { handleApi } from "../../server/api";
const handler = ({ request }: APIEvent) => handleApi(request, db());
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
