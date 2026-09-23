import { z } from 'zod'

export const consultationFormSchema = z.object({
  chiefComplaint: z.string().trim().optional(),
  temperature: z.string().trim().optional(),
  bloodPressure: z.string().trim().optional(),
  pulse: z.string().trim().optional(),
  respiratoryRate: z.string().trim().optional(),
  spo2: z.string().trim().optional(),
  weight: z.string().trim().optional(),
  height: z.string().trim().optional(),
  symptoms: z.string().trim().optional(),
  examinationNotes: z.string().trim().optional(),
  diagnosis: z.string().trim().optional(),
  treatmentPlan: z.string().trim().optional(),
  doctorNotes: z.string().trim().optional(),
  followUpDate: z.string().trim().optional(),
  followUpInstructions: z.string().trim().optional(),
})

export function toConsultationPayload(values) {
  const { temperature, bloodPressure, pulse, respiratoryRate, spo2, weight, height, ...rest } = values
  const vitals = { temperature, bloodPressure, pulse, respiratoryRate, spo2, weight, height }
  const hasVitals = Object.values(vitals).some(Boolean)

  return {
    ...rest,
    ...(hasVitals ? { vitals } : {}),
    ...(values.followUpDate ? { followUpDate: values.followUpDate } : { followUpDate: undefined }),
  }
}

export function fromConsultation(consultation) {
  return {
    chiefComplaint: consultation.chiefComplaint ?? '',
    temperature: consultation.vitals?.temperature ?? '',
    bloodPressure: consultation.vitals?.bloodPressure ?? '',
    pulse: consultation.vitals?.pulse ?? '',
    respiratoryRate: consultation.vitals?.respiratoryRate ?? '',
    spo2: consultation.vitals?.spo2 ?? '',
    weight: consultation.vitals?.weight ?? '',
    height: consultation.vitals?.height ?? '',
    symptoms: consultation.symptoms ?? '',
    examinationNotes: consultation.examinationNotes ?? '',
    diagnosis: consultation.diagnosis ?? '',
    treatmentPlan: consultation.treatmentPlan ?? '',
    doctorNotes: consultation.doctorNotes ?? '',
    followUpDate: consultation.followUpDate ? consultation.followUpDate.slice(0, 10) : '',
    followUpInstructions: consultation.followUpInstructions ?? '',
  }
}
