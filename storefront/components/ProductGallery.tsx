'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import Image from 'next/image';

/**
 * Which photograph the page is showing, shared between the gallery and the colour buttons.
 *
 * A saree is published with one photograph per colour, written in colour order, so the two
 * lists line up by position: picking the third colour and picking the third thumbnail mean
 * the same thing, and either should move the other. The context carries nothing but that
 * position, and defaults to a no-op so the colour buttons still work on any page that does
 * not wrap them.
 */
const ShownPhoto = createContext<{ index: number; show: (index: number) => void }>({
    index: 0,
    show: () => { },
});

export const useShownPhoto = () => useContext(ShownPhoto);

export function ProductView({ children }: { children: ReactNode }) {
    const [index, show] = useState(0);
    return <ShownPhoto.Provider value={{ index, show }}>{children}</ShownPhoto.Provider>;
}

/**
 * The large photograph. There is no thumbnail strip: one photograph is one colour, and the
 * colour row beside the price already shows all of them under a heading that says so - a
 * second strip of the same pictures was the same choice offered twice.
 */
export function ProductGallery({ images, name }: { images: string[]; name: string }) {
    const { index } = useShownPhoto();
    const shown = images[Math.min(index, images.length - 1)] ?? images[0];

    return (
        <div className="pdp-gallery">
            <div className="pdp-gallery-main">
                <Image
                    key={shown}
                    src={shown}
                    alt={`${name} — view ${index + 1}`}
                    width={693}
                    height={1200}
                    sizes="(max-width: 640px) 100vw, 640px"
                    quality={92}
                    priority
                />
            </div>

        </div>
    );
}
