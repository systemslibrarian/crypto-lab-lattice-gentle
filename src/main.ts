import './style.css'
import { mountHeroHook } from './ui/heroHook'
import { mountExhibitLattice } from './ui/exhibitLattice'
import { mountExhibitSvp } from './ui/exhibitSvp'
import { mountExhibitReduce } from './ui/exhibitReduce'
import { mountExhibitLweSis } from './ui/exhibitLweSis'
import { mountExhibitSchemes } from './ui/exhibitSchemes'
import { mountExitCheck } from './ui/exitCheck'
import { mountGuide } from './ui/guide'

// theme flipping and persistence belong to the shared top bar (#cl-theme-toggle);
// this app only renders correctly under both html[data-theme] values.

mountHeroHook(document.getElementById('hero-hook') as HTMLElement)
mountExhibitLattice(document.getElementById('exhibit-lattice') as HTMLElement)
mountExhibitSvp(document.getElementById('exhibit-svp') as HTMLElement)
mountExhibitReduce(document.getElementById('exhibit-reduce') as HTMLElement)
mountExhibitLweSis(document.getElementById('exhibit-lwe-sis') as HTMLElement)
mountExhibitSchemes(document.getElementById('exhibit-schemes') as HTMLElement)
mountExitCheck(document.getElementById('exhibit-check') as HTMLElement)
mountGuide(document.getElementById('guide-bar') as HTMLElement, document.getElementById('guide-nav') as HTMLElement)
