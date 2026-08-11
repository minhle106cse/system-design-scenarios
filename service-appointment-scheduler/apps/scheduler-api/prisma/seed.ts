/**
 * Demo fixtures — not in Cortex (core-api/prisma/ has no seed.ts). Required
 * here: a reviewer's path is `docker compose up -d` → migrate → run → cURL,
 * and an empty database has nothing to book against. See .ai/plans/init-source.plan.md §8.4.
 *
 * Run via `npm run db:seed` (root) or `npm run db:seed --workspace=@scheduler/api`.
 */
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../src/generated'

async function main() {
  const pool = new Pool({ connectionString: process.env.SCHEDULER_DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter })

  try {
    const dealership = await prisma.dealership.create({
      data: { name: 'Downtown Service Center', address: '1 Example Ave' },
    })

    const [bay1, bay2, bay3] = await Promise.all([
      prisma.serviceBay.create({ data: { dealershipId: dealership.id, label: 'Bay 1' } }),
      prisma.serviceBay.create({ data: { dealershipId: dealership.id, label: 'Bay 2' } }),
      prisma.serviceBay.create({ data: { dealershipId: dealership.id, label: 'Bay 3' } }),
    ])

    const [oilChange, brakeInspection, tireRotation, engineDiagnostic] = await Promise.all([
      prisma.serviceType.create({ data: { name: 'Oil Change', durationMinutes: 30 } }),
      prisma.serviceType.create({ data: { name: 'Brake Inspection', durationMinutes: 45 } }),
      prisma.serviceType.create({ data: { name: 'Tire Rotation', durationMinutes: 30 } }),
      prisma.serviceType.create({ data: { name: 'Engine Diagnostic', durationMinutes: 90 } }),
    ])

    // Three technicians with DIFFERENT qualifications — requirement 2 ("a
    // qualified Technician") is meaningless to demo if everyone can do
    // everything. Jordan is the only one qualified for engine diagnostics;
    // Sam and Priya overlap on the routine services.
    const jordan = await prisma.technician.create({
      data: { dealershipId: dealership.id, name: 'Jordan Lee' },
    })
    const sam = await prisma.technician.create({
      data: { dealershipId: dealership.id, name: 'Sam Ortiz' },
    })
    const priya = await prisma.technician.create({
      data: { dealershipId: dealership.id, name: 'Priya Nair' },
    })

    await prisma.technicianServiceType.createMany({
      data: [
        // Jordan: all four, including the specialist one
        { technicianId: jordan.id, serviceTypeId: oilChange.id },
        { technicianId: jordan.id, serviceTypeId: brakeInspection.id },
        { technicianId: jordan.id, serviceTypeId: tireRotation.id },
        { technicianId: jordan.id, serviceTypeId: engineDiagnostic.id },
        // Sam: routine services only
        { technicianId: sam.id, serviceTypeId: oilChange.id },
        { technicianId: sam.id, serviceTypeId: tireRotation.id },
        // Priya: routine services only, different pair
        { technicianId: priya.id, serviceTypeId: oilChange.id },
        { technicianId: priya.id, serviceTypeId: brakeInspection.id },
      ],
    })

    const customer = await prisma.customer.create({
      data: { name: 'Alex Rivera', email: 'alex.rivera@example.com', phone: '+1-555-0100' },
    })

    await prisma.vehicle.create({
      data: {
        customerId: customer.id,
        vin: '1HGCM82633A004352',
        make: 'Honda',
        model: 'Accord',
        year: 2021,
      },
    })

    console.log('Seed complete:')
    console.log(`  Dealership: ${dealership.name} (${dealership.id})`)
    console.log(`  Bays: ${[bay1, bay2, bay3].map((b) => b.label).join(', ')}`)
    console.log(
      `  Service types: ${[oilChange, brakeInspection, tireRotation, engineDiagnostic]
        .map((s) => `${s.name} (${s.durationMinutes}min)`)
        .join(', ')}`,
    )
    console.log(`  Technicians: Jordan Lee (all), Sam Ortiz (oil/tire), Priya Nair (oil/brake)`)
    console.log(`  Customer: ${customer.name} <${customer.email}> with 1 vehicle`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
