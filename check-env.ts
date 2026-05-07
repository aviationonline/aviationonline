import dotenv from "dotenv";
dotenv.config();
console.log("SMTP_HOST:", process.env.SMTP_HOST ? "SET" : "NOT SET");
console.log("SMTP_USER:", process.env.SMTP_USER ? "SET" : "NOT SET");
