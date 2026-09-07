import { describe, expect, mock, test } from 'bun:test'
import type { UserProfile } from '@/modules/user-profile/entities/user-profile.entity'
import type { UserProfileRepository } from '@/modules/user-profile/repo/user-profile.repository'
import { GetMyProfileUseCase } from '@/modules/user-profile/use-cases/get-my-profile'
import type { UserUnitOfWork } from '@/shared/database/user-unit-of-work'

const userId = '550e8400-e29b-41d4-a716-446655440000'

describe('GetMyProfileUseCase', () => {
  test('runs lazy profile creation through the transaction repository', async () => {
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
      getOrCreate: mock(async () => profile),
      update: mock(async () => profile),
    }
    const unitOfWork: UserUnitOfWork = {
      run: mock(async work => work({ userProfiles })),
    }

    await expect(GetMyProfileUseCase({ unitOfWork })(userId)).resolves.toBe(profile)
    expect(unitOfWork.run).toHaveBeenCalledTimes(1)
    expect(userProfiles.getOrCreate).toHaveBeenCalledWith(userId)
  })
})
