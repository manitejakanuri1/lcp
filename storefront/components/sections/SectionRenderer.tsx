import type { HomepageBlock } from '@/lib/types';
import { HeroBanner } from './HeroBanner';
import { SixMoods } from './SixMoods';
import { BrandStory } from './BrandStory';
import { ProductCarousel } from './ProductCarousel';
import { BridalSpotlight } from './BridalSpotlight';
import { CampaignBanner } from './CampaignBanner';
import { EditsGrid } from './EditsGrid';
import { CollectionTiles } from './CollectionTiles';
import { EditorialPanels } from './EditorialPanels';
import { FilmSlider } from './FilmSlider';
import { CardStack } from './CardStack';

/**
 * Switches on the CMS block's `type`. An unrecognized type is skipped rather than
 * thrown — marketing can add new block types on the CMS side before this renderer
 * knows about them, and the page must stay up (01-landing-page.md).
 */
export function SectionRenderer({ block }: { block: HomepageBlock }) {
  switch (block.type) {
    case 'hero-banner':
      return <HeroBanner block={block} />;
    case 'six-moods':
      return <SixMoods block={block} />;
    case 'brand-story':
      return <BrandStory block={block} />;
    case 'product-carousel':
      return <ProductCarousel block={block} />;
    case 'bridal-spotlight':
      return <BridalSpotlight block={block} />;
    case 'campaign-banner':
      return <CampaignBanner block={block} />;
    case 'edits-grid':
      return <EditsGrid block={block} />;
    case 'collection-tiles':
      return <CollectionTiles block={block} />;
    case 'editorial-panels':
      return <EditorialPanels block={block} />;
    case 'film-slider':
      return <FilmSlider block={block} />;
    case 'card-stack':
      return <CardStack block={block} />;
    default:
      return null;
  }
}
