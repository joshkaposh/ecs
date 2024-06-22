/// The kinds of ID that [`super::Identifier`] can represent. Each
/// variant imposes different usages of the low/high segments
/// of the ID.
export const IdKind = {
    /// An ID variant that is compatible with [`crate::entity::Entity`].
    Entity: 0,
    /// A future ID variant.
    Placeholder: 0b1000_0000,
} as const

export type IdKindType = typeof IdKind[keyof typeof IdKind];