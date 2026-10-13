import { expect, test } from 'bun:test'
import { approveText } from '../hooks/register'

test('Approve sends "push" when the ask is about a push', () => {
  expect(approveText({ id: 'T-5', ask: 'OK to push the local commits?', title: 'Land it' })).toBe('push')
})

test('Approve names the item when the ask is not about a push', () => {
  expect(approveText({ id: 'T-7', ask: 'Pick a colour', title: 'Rail' })).toBe('approve T-7')
  expect(approveText({ id: '', ask: 'Pick a colour', title: 'Rail' })).toBe('approve: Rail')
})
