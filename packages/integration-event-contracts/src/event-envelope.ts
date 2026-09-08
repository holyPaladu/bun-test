export type ContractSchema =
  | { readonly type: 'string'; readonly format?: string }
  | { readonly const: string }
  | {
    readonly type: 'object'
    readonly properties: Readonly<Record<string, ContractSchema>>
    readonly required: readonly string[]
    readonly additionalProperties: false
  }

export type Static<TSchema extends ContractSchema> =
  TSchema extends { readonly const: infer TValue extends string } ? TValue
    : TSchema extends { readonly type: 'string' } ? string
      : TSchema extends {
        readonly type: 'object'
        readonly properties: infer TProperties extends Readonly<Record<string, ContractSchema>>
      } ? { [TKey in keyof TProperties]: Static<TProperties[TKey]> }
        : never

export const schemaKind = Symbol.for('TypeBox.Kind')

export const createEventEnvelopeSchema = <
  TType extends string,
  TData extends ContractSchema & { readonly type: 'object' },
>(eventType: TType, data: TData) => ({
  [schemaKind]: 'Object',
  type: 'object',
  properties: {
    eventId: { [schemaKind]: 'String', type: 'string', format: 'uuid' },
    type: { [schemaKind]: 'Literal', const: eventType },
    occurredAt: { [schemaKind]: 'String', type: 'string', format: 'date-time' },
    data,
  },
  required: ['eventId', 'type', 'occurredAt', 'data'],
  additionalProperties: false,
} as const)
