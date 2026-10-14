import { createApp } from "../src/app.js";
import { connectTestDB, clearTestDB, disconnectTestDB } from "./testDb.js";
import { registerClinicAgent, createStaffAgent } from "./helpers.js";
import { User } from "../src/models/User.js";

const app = createApp();

beforeAll(async () => {
  await connectTestDB();
});

afterEach(async () => {
  await clearTestDB();
});

afterAll(async () => {
  await disconnectTestDB();
});

async function setup() {
  const { agent: ownerAgent } = await registerClinicAgent(app);
  const { agent: doctorAgent, email } = await createStaffAgent(
    app,
    ownerAgent,
    "doctor",
    { name: "Mehta" },
  );
  const { agent: receptionistAgent } = await createStaffAgent(
    app,
    ownerAgent,
    "receptionist",
  );
  const staff = (await ownerAgent.get("/api/v1/users")).body.data.staff;
  const doctor = staff.find((u) => u.email === email);
  const patient = (
    await ownerAgent
      .post("/api/v1/patients")
      .send({
        fullName: "Rahul Sharma",
        age: 34,
        gender: "male",
        phone: "9876543210",
      })
  ).body.data.patient;
  return { ownerAgent, doctorAgent, receptionistAgent, doctor, patient };
}

// Monday-Saturday: a morning and an evening session; Sunday off. The test
// clinic is on Asia/Kolkata (UTC+5:30), the registration default.
const SPLIT_SHIFT = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
].map((day) => ({
  day,
  isAvailable: day !== "sunday",
  sessions:
    day === "sunday"
      ? []
      : [
          { start: "10:00", end: "13:00" },
          { start: "17:00", end: "20:00" },
        ],
}));

const profileUrl = (doctor) => `/api/v1/users/${doctor._id}/doctor-profile`;

describe("doctor fee and working hours on the profile", () => {
  it("lets an owner set both, and the staff list carries them", async () => {
    const { ownerAgent, doctor } = await setup();

    const res = await ownerAgent
      .patch(profileUrl(doctor))
      .send({ consultationFee: 600, workingHours: SPLIT_SHIFT });
    expect(res.status).toBe(200);
    expect(res.body.data.user.doctorProfile.consultationFee).toBe(600);
    expect(res.body.data.user.doctorProfile.workingHours).toEqual(SPLIT_SHIFT);

    const listed = (await ownerAgent.get("/api/v1/users")).body.data.staff.find(
      (u) => u._id === doctor._id,
    );
    expect(listed.doctorProfile.consultationFee).toBe(600);
    expect(listed.doctorProfile.workingHours[6]).toEqual({
      day: "sunday",
      isAvailable: false,
      sessions: [],
    });
  });

  it("clears both with null: back to the clinic fee and no fixed hours", async () => {
    const { ownerAgent, doctor } = await setup();
    await ownerAgent
      .patch(profileUrl(doctor))
      .send({ consultationFee: 600, workingHours: SPLIT_SHIFT });

    const res = await ownerAgent
      .patch(profileUrl(doctor))
      .send({ consultationFee: null, workingHours: null });
    expect(res.status).toBe(200);
    const stored = await User.findById(doctor._id).lean();
    expect(stored.doctorProfile.consultationFee).toBeUndefined();
    expect(stored.doctorProfile.workingHours).toBeUndefined();
  });

  it("drops the sessions of a day marked off", async () => {
    const { ownerAgent, doctor } = await setup();
    const hours = SPLIT_SHIFT.map((d) =>
      d.day === "monday" ? { ...d, isAvailable: false } : d,
    );

    const res = await ownerAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: hours });
    expect(res.body.data.user.doctorProfile.workingHours[0]).toEqual({
      day: "monday",
      isAvailable: false,
      sessions: [],
    });
  });

  it("lets a doctor set their own hours but not their own fee", async () => {
    const { doctorAgent, doctor } = await setup();

    expect(
      (
        await doctorAgent
          .patch(profileUrl(doctor))
          .send({ workingHours: SPLIT_SHIFT })
      ).status,
    ).toBe(200);
    const res = await doctorAgent
      .patch(profileUrl(doctor))
      .send({ consultationFee: 2000 });
    expect(res.status).toBe(403);
    expect(
      (await User.findById(doctor._id).lean()).doctorProfile.consultationFee,
    ).toBeUndefined();
  });

  it("forbids other staff from changing a doctor's hours", async () => {
    const { receptionistAgent, doctor } = await setup();
    const res = await receptionistAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: SPLIT_SHIFT });
    expect(res.status).toBe(403);
  });

  it.each([
    ["a negative fee", { consultationFee: -1 }],
    ["fewer than 7 days", { workingHours: SPLIT_SHIFT.slice(0, 6) }],
    [
      "days out of order",
      { workingHours: [...SPLIT_SHIFT.slice(1), SPLIT_SHIFT[0]] },
    ],
    [
      "a working day with no hours",
      {
        workingHours: SPLIT_SHIFT.map((d) => ({
          ...d,
          sessions: d.isAvailable ? [] : d.sessions,
        })),
      },
    ],
    [
      "a session ending before it starts",
      {
        workingHours: SPLIT_SHIFT.map((d) => ({
          ...d,
          sessions: d.isAvailable ? [{ start: "13:00", end: "10:00" }] : [],
        })),
      },
    ],
    [
      "overlapping sessions",
      {
        workingHours: SPLIT_SHIFT.map((d) => ({
          ...d,
          sessions: d.isAvailable
            ? [
                { start: "10:00", end: "13:00" },
                { start: "12:00", end: "15:00" },
              ]
            : [],
        })),
      },
    ],
    [
      "three sessions",
      {
        workingHours: SPLIT_SHIFT.map((d) => ({
          ...d,
          sessions: d.isAvailable
            ? [...d.sessions, { start: "21:00", end: "22:00" }]
            : [],
        })),
      },
    ],
  ])("rejects %s", async (_label, body) => {
    const { ownerAgent, doctor } = await setup();
    const res = await ownerAgent.patch(profileUrl(doctor)).send(body);
    expect(res.status).toBe(400);
  });
});

// 2026-09-01 is a Tuesday, 2026-09-06 a Sunday.
const book = (agent, doctor, patient, scheduledAt, extra = {}) =>
  agent
    .post("/api/v1/appointments")
    .send({
      doctorId: doctor._id,
      patientId: patient._id,
      scheduledAt,
      durationMinutes: 15,
      ...extra,
    });

describe("booking against the doctor's hours", () => {
  it("books inside either session", async () => {
    const { ownerAgent, receptionistAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: SPLIT_SHIFT });

    expect(
      (
        await book(
          receptionistAgent,
          doctor,
          patient,
          "2026-09-01T04:30:00.000Z",
        )
      ).status,
    ).toBe(201); // 10:00 IST
    expect(
      (
        await book(
          receptionistAgent,
          doctor,
          patient,
          "2026-09-01T14:15:00.000Z",
        )
      ).status,
    ).toBe(201); // 19:45-20:00 IST
  });

  it("refuses a time in the break, with the hours in the message", async () => {
    const { ownerAgent, receptionistAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: SPLIT_SHIFT });

    const res = await book(
      receptionistAgent,
      doctor,
      patient,
      "2026-09-01T08:30:00.000Z",
    ); // 14:00 IST
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("OUTSIDE_WORKING_HOURS");
    expect(res.body.message).toBe(
      "That time is outside Dr. Mehta's hours. On Tuesdays they see patients 10:00 AM-1:00 PM and 5:00 PM-8:00 PM.",
    );
    expect(res.body.details).toEqual({
      day: "tuesday",
      sessions: SPLIT_SHIFT[1].sessions,
    });
  });

  it("refuses a booking that runs past the end of a session", async () => {
    const { ownerAgent, receptionistAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: SPLIT_SHIFT });

    const res = await book(
      receptionistAgent,
      doctor,
      patient,
      "2026-09-01T07:15:00.000Z",
      { durationMinutes: 30 },
    ); // 12:45-13:15 IST
    expect(res.status).toBe(409);
  });

  it("refuses a day off", async () => {
    const { ownerAgent, receptionistAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: SPLIT_SHIFT });

    const res = await book(
      receptionistAgent,
      doctor,
      patient,
      "2026-09-06T05:00:00.000Z",
    );
    expect(res.status).toBe(409);
    expect(res.body.message).toBe("Dr. Mehta doesn't see patients on Sundays.");
  });

  it("books outside the hours when the front desk confirms", async () => {
    const { ownerAgent, receptionistAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: SPLIT_SHIFT });

    const res = await book(
      receptionistAgent,
      doctor,
      patient,
      "2026-09-06T05:00:00.000Z",
      { allowOutsideHours: true },
    );
    expect(res.status).toBe(201);
  });

  it("books any time for a doctor with no fixed hours", async () => {
    const { receptionistAgent, doctor, patient } = await setup();
    expect(
      (
        await book(
          receptionistAgent,
          doctor,
          patient,
          "2026-09-06T17:00:00.000Z",
        )
      ).status,
    ).toBe(201); // Sunday 22:30 IST
  });

  it("checks a reschedule the same way", async () => {
    const { ownerAgent, receptionistAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch(profileUrl(doctor))
      .send({ workingHours: SPLIT_SHIFT });
    const id = (
      await book(receptionistAgent, doctor, patient, "2026-09-01T04:30:00.000Z")
    ).body.data.appointment._id;

    const refused = await receptionistAgent
      .patch(`/api/v1/appointments/${id}`)
      .send({ scheduledAt: "2026-09-01T08:30:00.000Z" });
    expect(refused.status).toBe(409);
    expect(refused.body.code).toBe("OUTSIDE_WORKING_HOURS");

    const confirmed = await receptionistAgent
      .patch(`/api/v1/appointments/${id}`)
      .send({
        scheduledAt: "2026-09-01T08:30:00.000Z",
        allowOutsideHours: true,
      });
    expect(confirmed.status).toBe(200);

    // Notes alone don't re-check the time.
    expect(
      (
        await receptionistAgent
          .patch(`/api/v1/appointments/${id}`)
          .send({ notes: "Fasting" })
      ).status,
    ).toBe(200);
  });

  it("never blocks a walk-in", async () => {
    const { ownerAgent, receptionistAgent, doctor, patient } = await setup();
    const allOff = SPLIT_SHIFT.map((d) => ({
      ...d,
      isAvailable: false,
      sessions: [],
    }));
    await ownerAgent.patch(profileUrl(doctor)).send({ workingHours: allOff });

    const res = await receptionistAgent
      .post("/api/v1/appointments/walk-in")
      .send({ doctorId: doctor._id, patientId: patient._id });
    expect(res.status).toBe(201);
  });
});

describe("the doctor's fee on a bill", () => {
  async function consultation(agent, doctor, patient) {
    const res = await agent
      .post("/api/v1/consultations")
      .send({
        patientId: patient._id,
        doctorId: doctor._id,
        diagnosis: "Viral fever",
      });
    return res.body.data.consultation;
  }

  it("prefills the doctor's own fee", async () => {
    const { ownerAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch("/api/v1/clinics/settings")
      .send({ defaultConsultationFee: 400 });
    await ownerAgent.patch(profileUrl(doctor)).send({ consultationFee: 750 });
    const c = await consultation(ownerAgent, doctor, patient);

    const res = await ownerAgent
      .post("/api/v1/invoices")
      .send({
        patientId: patient._id,
        doctorId: doctor._id,
        consultationId: c._id,
      });
    expect(res.status).toBe(201);
    expect(res.body.data.invoice.items).toEqual([
      expect.objectContaining({
        description: "Consultation Fee",
        unitPrice: 750,
      }),
    ]);
  });

  it("falls back to the clinic fee for a doctor without one", async () => {
    const { ownerAgent, doctor, patient } = await setup();
    await ownerAgent
      .patch("/api/v1/clinics/settings")
      .send({ defaultConsultationFee: 400 });
    const c = await consultation(ownerAgent, doctor, patient);

    const res = await ownerAgent
      .post("/api/v1/invoices")
      .send({
        patientId: patient._id,
        doctorId: doctor._id,
        consultationId: c._id,
      });
    expect(res.body.data.invoice.items[0].unitPrice).toBe(400);
  });
});
