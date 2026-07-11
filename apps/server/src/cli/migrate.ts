import{migrate,closeDatabase}from"../shared/database.js";migrate();closeDatabase();process.stdout.write("Database migrations applied.\n");

