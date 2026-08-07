import { createServerFn } from "@tanstack/react-start";
import { getAuth } from "@clerk/tanstack-start/server";
import { sql } from "~/db/index";

const CODE_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

export interface Classroom {
  id: string;
  teacher_id: string;
  name: string;
  code: string;
  created_at: string;
  /** Number of students who have joined (0 for a freshly created classroom). */
  student_count: number;
}

export interface ClassroomResponse {
  id: number;
  prompt_id: number;
  classroom_id: string;
  user_id: string;
  author_name: string;
  content: string;
  word_count: number;
  created_at: string;
  /** Prompt text for display when grouped by prompt (set by getClassroomResponses). */
  prompt_text?: string;
}

function randomCode(): string {
  const letters = Array.from({ length: 3 }, () =>
    CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)],
  ).join("");
  const digits = String(Math.floor(Math.random() * 1000)).padStart(3, "0");
  return `${letters}-${digits}`;
}

/**
 * Pull the HTTP Request out of a server-function handler ctx. TanStack Start
 * passes the ctx as a wrapper object ({ request, context, method, ... }) with
 * the real Request under `ctx.request` — but we defensively accept a bare
 * Request too, since that shape varies across versions. Clerk's getAuth needs
 * the actual Request to read the session cookie.
 */
function requestFromCtx(ctx: unknown): Request {
  const maybe = ctx as { request?: unknown } | undefined;
  return (maybe?.request ?? ctx) as Request;
}

async function requireTeacher(ctx: unknown): Promise<string> {
  const auth = await getAuth(requestFromCtx(ctx));
  if (!auth.userId) throw new Error("You must be signed in as a teacher.");
  return auth.userId;
}

/** Create a classroom owned by the authenticated Clerk user. */
export const createClassroom = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { name?: unknown };
    const name = String(d?.name ?? "").trim().slice(0, 160);
    if (!name) throw new Error("Classroom name is required.");
    return { name };
  })
  .handler(async ({ data, ...ctx }) => {
    const teacherId = await requireTeacher(ctx);
    const db = sql();
    // The unique constraint makes a collision harmless; retry with a new code.
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const rows = await db`
          INSERT INTO classrooms (teacher_id, name, code)
          VALUES (${teacherId}, ${data.name}, ${randomCode()})
          RETURNING id, teacher_id, name, code, created_at
        `;
        const row = rows[0];
        return {
          id: String(row.id), teacher_id: String(row.teacher_id), name: String(row.name),
          code: String(row.code), created_at: String(row.created_at), student_count: 0,
        } satisfies Classroom;
      } catch (error) {
        if (attempt === 4 || !String(error).toLowerCase().includes("unique")) throw error;
      }
    }
    throw new Error("Could not generate a unique classroom code.");
  });

/** Return classrooms owned by the authenticated Clerk user, newest first. */
export const getTeacherClassrooms = createServerFn().handler(async (ctx) => {
  const teacherId = await requireTeacher(ctx);
  const db = sql();
  const rows = await db`
    SELECT c.id, c.teacher_id, c.name, c.code, c.created_at,
           COUNT(cs.id)::int AS student_count
    FROM classrooms c
    LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
    WHERE c.teacher_id = ${teacherId}
    GROUP BY c.id
    ORDER BY c.created_at DESC
  `;
  return rows.map((row) => ({
    id: String(row.id), teacher_id: String(row.teacher_id), name: String(row.name),
    code: String(row.code), created_at: String(row.created_at),
    student_count: Number(row.student_count ?? 0),
  })) satisfies Classroom[];
});

/** Fetch a single classroom, only if the authenticated user owns it. */
export const getTeacherClassroom = createServerFn()
  .validator((data: unknown) => {
    const d = data as { classroomId?: unknown };
    const classroomId = String(d?.classroomId ?? "").trim();
    if (!classroomId) throw new Error("Classroom is required.");
    return { classroomId };
  })
  .handler(async ({ data, ...ctx }) => {
    const teacherId = await requireTeacher(ctx);
    const db = sql();
    const rows = await db`
      SELECT c.id, c.teacher_id, c.name, c.code, c.created_at,
             COUNT(cs.id)::int AS student_count
      FROM classrooms c
      LEFT JOIN classroom_students cs ON cs.classroom_id = c.id
      WHERE c.id = ${data.classroomId} AND c.teacher_id = ${teacherId}
      GROUP BY c.id
    `;
    if (!rows.length) throw new Error("Classroom not found.");
    const row = rows[0];
    return {
      id: String(row.id), teacher_id: String(row.teacher_id), name: String(row.name),
      code: String(row.code), created_at: String(row.created_at),
      student_count: Number(row.student_count ?? 0),
    } satisfies Classroom;
  });

/** Add an accountless student to a classroom by join code. */
export const joinClassroom = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { code?: unknown; studentName?: unknown };
    const code = String(d?.code ?? "").trim().toUpperCase();
    const studentName = String(d?.studentName ?? "").trim().slice(0, 100);
    if (!/^[A-Z]{3}-\d{3}$/.test(code)) throw new Error("Invalid classroom code.");
    if (!studentName) throw new Error("Student name is required.");
    return { code, studentName };
  })
  .handler(async ({ data }) => {
    const db = sql();
    const classrooms = await db`SELECT id, name, code FROM classrooms WHERE code = ${data.code}`;
    if (!classrooms.length) throw new Error("Classroom not found. Check the code and try again.");
    const classroom = classrooms[0];
    try {
      const students = await db`
        INSERT INTO classroom_students (classroom_id, name) VALUES (${classroom.id}, ${data.studentName})
        RETURNING id
      `;
      return { classroom: { id: String(classroom.id), name: String(classroom.name), code: String(classroom.code) }, studentId: String(students[0].id) };
    } catch (error) {
      if (String(error).toLowerCase().includes("unique")) throw new Error("That name is already in use in this classroom.");
      throw error;
    }
  });

function classroomInput(data: unknown) {
  const d = data as { classroomId?: unknown; studentId?: unknown };
  const classroomId = String(d?.classroomId ?? "").trim();
  const studentId = String(d?.studentId ?? "").trim();
  if (!classroomId || !studentId) throw new Error("Classroom and student are required.");
  return { classroomId, studentId };
}

/** Read classroom responses — the owning teacher (signed in) or a member student. */
export const getClassroomResponses = createServerFn()
  .validator((data: unknown) => {
    const d = data as { classroomId?: unknown; studentId?: unknown };
    const classroomId = String(d?.classroomId ?? "").trim();
    const studentId = String(d?.studentId ?? "").trim();
    if (!classroomId) throw new Error("Classroom is required.");
    // Teachers (signed in) don't need a student id; accountless students do.
    return { classroomId, studentId };
  })
  .handler(async ({ data, ...ctx }) => {
    const db = sql();
    const auth = await getAuth(requestFromCtx(ctx));
    if (auth.userId) {
      // A signed-in caller must be this classroom's teacher.
      const owned = await db`
        SELECT 1 FROM classrooms WHERE id = ${data.classroomId} AND teacher_id = ${auth.userId}
      `;
      if (!owned.length) throw new Error("You are not the teacher of this classroom.");
    } else {
      // Accountless students identify themselves with their classroom_students id.
      if (!data.studentId) throw new Error("Student membership is required.");
      const member = await db`
        SELECT 1 FROM classroom_students WHERE id = ${data.studentId} AND classroom_id = ${data.classroomId}
      `;
      if (!member.length) throw new Error("You are not a member of this classroom.");
    }
    const rows = await db`
      SELECT r.id, r.prompt_id, r.classroom_id, r.user_id, r.author_name, r.content, r.word_count, r.created_at,
             p.prompt_text
      FROM responses r
      LEFT JOIN prompts p ON p.id = r.prompt_id
      WHERE r.classroom_id = ${data.classroomId}
      ORDER BY r.created_at DESC LIMIT 500
    `;
    return rows.map((row) => ({
      id: Number(row.id), prompt_id: Number(row.prompt_id), classroom_id: String(row.classroom_id), user_id: String(row.user_id), author_name: String(row.author_name ?? "Anonymous"), content: String(row.content), word_count: Number(row.word_count ?? 0), created_at: String(row.created_at), prompt_text: String(row.prompt_text ?? "Untitled prompt"),
    })) satisfies ClassroomResponse[];
  });

/** Submit a classroom response after verifying the accountless student membership. */
export const submitClassroomResponse = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = data as { promptId?: unknown; classroomId?: unknown; studentId?: unknown; content?: unknown };
    const promptId = Number(d?.promptId);
    const { classroomId, studentId } = classroomInput(d);
    const content = String(d?.content ?? "").trim();
    const wordCount = content.split(/\s+/).filter(Boolean).length;
    if (!Number.isInteger(promptId) || promptId <= 0) throw new Error("Invalid prompt.");
    if (!content || wordCount > 500) throw new Error("Response must contain 1–500 words.");
    return { promptId, classroomId, studentId, content, wordCount };
  })
  .handler(async ({ data }) => {
    const db = sql();
    const students = await db`SELECT name FROM classroom_students WHERE id = ${data.studentId} AND classroom_id = ${data.classroomId}`;
    if (!students.length) throw new Error("You are not a member of this classroom.");
    const rows = await db`
      INSERT INTO responses (prompt_id, classroom_id, user_id, author_name, content, word_count)
      VALUES (${data.promptId}, ${data.classroomId}, ${data.studentId}, ${students[0].name}, ${data.content}, ${data.wordCount})
      RETURNING id, prompt_id, classroom_id, user_id, author_name, content, word_count, created_at
    `;
    const row = rows[0];
    return { id: Number(row.id), prompt_id: Number(row.prompt_id), classroom_id: String(row.classroom_id), user_id: String(row.user_id), author_name: String(row.author_name), content: String(row.content), word_count: Number(row.word_count), created_at: String(row.created_at) } satisfies ClassroomResponse;
  });
