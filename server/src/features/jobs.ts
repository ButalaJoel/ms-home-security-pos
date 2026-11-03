/**
 * Installation job cards: site, technician, date, status and the
 * customer's sign-off (name, notes and an optional drawn signature).
 */
import { Router, type Request, type Response } from "express";
import { connectToDatabase } from "../db.js";
import { requireAuth } from "../authMiddleware.js";
import {
  cleanText,
  currentUserName,
  handleFailure,
  nextDocumentNumber,
  parseDate,
  searchRegex,
  sendError,
  serialize,
  toObjectId,
} from "./common.js";

export const JOB_STATUSES = ["Scheduled", "In progress", "Completed", "Cancelled"] as const;
type JobStatus = (typeof JOB_STATUSES)[number];

// A drawn signature is a small PNG data URL from the sign-off pad.
const SIGNATURE = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;
const MAX_SIGNATURE_LENGTH = 300_000;

type JobFields = {
  customerName: string;
  customerPhone: string;
  siteAddress: string;
  description: string;
  technician: string;
  scheduledDate: Date | null;
  status: JobStatus;
  quotationNumber: string;
  saleReference: string;
  notes: string;
  signedOffBy: string;
  signOffNotes: string;
  signature: string;
};

function parseJob(body: unknown): JobFields | string {
  if (!body || typeof body !== "object") return "Job details are required.";
  const input = body as Record<string, unknown>;
  const customerName = cleanText(input.customerName, 200);
  if (!customerName) return "Enter the customer name.";
  const siteAddress = cleanText(input.siteAddress, 300);
  if (!siteAddress) return "Enter the site address or location.";
  const description = cleanText(input.description, 3000);
  if (!description) return "Describe the work to be done.";

  const status = (cleanText(input.status, 20) || "Scheduled") as JobStatus;
  if (!JOB_STATUSES.includes(status)) return "Choose a valid job status.";

  let scheduledDate: Date | null = null;
  if (input.scheduledDate) {
    scheduledDate = parseDate(input.scheduledDate);
    if (!scheduledDate) return "Invalid scheduled date.";
  }

  const signature = typeof input.signature === "string" ? input.signature : "";
  if (signature && (!SIGNATURE.test(signature) || signature.length > MAX_SIGNATURE_LENGTH)) {
    return "The signature image is invalid or too large.";
  }

  return {
    customerName,
    customerPhone: cleanText(input.customerPhone, 60),
    siteAddress,
    description,
    technician: cleanText(input.technician, 120),
    scheduledDate,
    status,
    quotationNumber: cleanText(input.quotationNumber, 60),
    saleReference: cleanText(input.saleReference, 60),
    notes: cleanText(input.notes, 3000),
    signedOffBy: cleanText(input.signedOffBy, 200),
    signOffNotes: cleanText(input.signOffNotes, 2000),
    signature,
  };
}

const router = Router();
router.use(requireAuth);

// GET /api/jobs?search=&status=&technician=
router.get("/", async (req: Request, res: Response) => {
  try {
    const db = await connectToDatabase();
    const filter: Record<string, unknown> = {};
    const status = cleanText(req.query.status, 20);
    if (JOB_STATUSES.includes(status as JobStatus)) filter.status = status;
    const technician = cleanText(req.query.technician, 120);
    if (technician) filter.technician = technician;
    const search = searchRegex(req.query.search);
    if (search) {
      filter.$or = [
        { number: search }, { customerName: search }, { customerPhone: search },
        { siteAddress: search }, { technician: search }, { description: search },
      ];
    }
    const jobs = await db
      .collection("jobs")
      .find(filter, { projection: { signature: 0 } })
      .sort({ scheduledDate: -1, createdAt: -1 })
      .limit(500)
      .toArray();
    const technicians = (await db.collection("jobs").distinct("technician")).filter(Boolean).sort();
    res.json({ success: true, jobs: jobs.map(serialize), technicians });
  } catch (error) {
    handleFailure(res, "Could not load jobs", error);
  }
});

// GET /api/jobs/:id  (includes the signature)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid job ID.");
    const db = await connectToDatabase();
    const job = await db.collection("jobs").findOne({ _id: id });
    if (!job) return sendError(res, 404, "Job not found.");
    res.json({ success: true, job: serialize(job) });
  } catch (error) {
    handleFailure(res, "Could not load the job", error);
  }
});

// POST /api/jobs
router.post("/", async (req: Request, res: Response) => {
  try {
    const parsed = parseJob(req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);
    const db = await connectToDatabase();
    const user = await currentUserName(db, req);
    const now = new Date();
    const document = {
      number: await nextDocumentNumber(db, "JOB"),
      ...parsed,
      completedAt: parsed.status === "Completed" ? now : null,
      createdByName: user.name,
      updatedByName: user.name,
      createdAt: now,
      updatedAt: now,
    };
    const result = await db.collection("jobs").insertOne(document);
    res.status(201).json({ success: true, message: `Job ${document.number} created.`, job: serialize({ _id: result.insertedId, ...document }) });
  } catch (error) {
    handleFailure(res, "Could not create the job", error);
  }
});

// PUT /api/jobs/:id
router.put("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid job ID.");
    const parsed = parseJob(req.body);
    if (typeof parsed === "string") return sendError(res, 400, parsed);
    const db = await connectToDatabase();
    const existing = await db.collection("jobs").findOne({ _id: id }, { projection: { status: 1, completedAt: 1 } });
    if (!existing) return sendError(res, 404, "Job not found.");
    const user = await currentUserName(db, req);
    const completedAt =
      parsed.status === "Completed" ? existing.completedAt ?? new Date() : null;
    const updated = await db.collection("jobs").findOneAndUpdate(
      { _id: id },
      { $set: { ...parsed, completedAt, updatedByName: user.name, updatedAt: new Date() } },
      { returnDocument: "after" },
    );
    if (!updated) return sendError(res, 404, "Job not found.");
    res.json({ success: true, message: `Job ${updated.number} saved.`, job: serialize(updated) });
  } catch (error) {
    handleFailure(res, "Could not save the job", error);
  }
});

// DELETE /api/jobs/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = toObjectId(req.params.id);
    if (!id) return sendError(res, 400, "Invalid job ID.");
    const db = await connectToDatabase();
    const result = await db.collection("jobs").deleteOne({ _id: id });
    if (result.deletedCount !== 1) return sendError(res, 404, "Job not found.");
    res.json({ success: true, message: "Job deleted." });
  } catch (error) {
    handleFailure(res, "Could not delete the job", error);
  }
});

export default router;
