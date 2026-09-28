import knex from "knex";
import { databaseConfig } from "../../config/database.js";
export const createDatabase = () => knex(databaseConfig());
let database;
export const db = () => (database ??= createDatabase());
