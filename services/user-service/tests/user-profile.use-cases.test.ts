import { describe, expect, mock, test } from 'bun:test'
import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import type { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import { createGetMyProfileUseCase } from '@/modules/user-profile/use-cases/get-my-profile'
import { NotFoundError } from '@/shared/errors/app-error'

const userId = '550e8400-e29b-41d4-a716-446655440000'

describe('GetMyProfileUseCase', () => {
  test('returns an existing profile without lazy creation', async () => {
    const profile: UserProfile = {
      id: userId,
      displayName: null,
      avatarUrl: null,
      locale: null,
      timezone: null,
      createdAt: new Date('2026-09-07T10:00:00.000Z'),
      updatedAt: new Date('2026-09-07T10:00:00.000Z'),
    }
    const userProfiles: UserProfileRepository = {
      createIfAbsent: mock(async () => {}),
      findById: mock(async () => profile),
      update: mock(async () => profile),
    }

    await expect(createGetMyProfileUseCase({ userProfiles })({ userId }))
      .resolves.toBe(profile)
    expect(userProfiles.findById).toHaveBeenCalledWith(userId)
    expect(userProfiles.createIfAbsent).not.toHaveBeenCalled()
  })

  test('returns not found while an account-created event is still pending', async () => {
    const userProfiles: UserProfileRepository = {
      createIfAbsent: mock(async () => {}),
      findById: mock(async () => null),
      update: mock(async () => null),
    }

    await expect(createGetMyProfileUseCase({ userProfiles })({ userId }))
      .rejects.toBeInstanceOf(NotFoundError)
  })
})
