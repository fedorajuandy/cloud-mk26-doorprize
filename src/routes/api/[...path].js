import { db } from "../../server/db.js";
import { handleApi } from "../../server/api.js";
const handler = ({ request }) => handleApi(request, db());
export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
